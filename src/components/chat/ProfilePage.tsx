import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Camera } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface Props {
  onBack: () => void;
}

export default function ProfilePage({ onBack }: Props) {
  const { user } = useAuth();
  const { profile, loading, updateProfile } = useProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Populate form once profile loads
  useEffect(() => {
    if (profile) {
      setName(profile.display_name || '');
      setBio(profile.bio || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // upsert so it works even if profile row doesn't exist yet
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          display_name: name.trim(),
          bio: bio.trim(),
          phone: phone.trim(),
          email: user.email ?? '',
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Profile save error:', error);
        toast.error('Failed to save: ' + error.message);
      } else {
        toast.success('Profile saved!');
        // refresh local state
        await updateProfile({ display_name: name.trim(), bio: bio.trim(), phone: phone.trim() });
      }
    } catch (e) {
      toast.error('Unexpected error saving profile');
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload failed: ' + error.message);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await updateProfile({ avatar_url: publicUrl });
    toast.success('Avatar updated!');
    setUploading(false);
  };

  const initials = (n: string | null) =>
    n ? n.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2) : '?';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">Profile</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-lg space-y-6"
        >
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {initials(name || profile?.display_name || null)}
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition">
                {uploading
                  ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  : <Camera className="h-3.5 w-3.5" />
                }
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Form */}
          <Card>
            <CardHeader><CardTitle className="text-base">Edit Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                {/* email comes from auth, shown read-only */}
                <Input value={user?.email ?? profile?.email ?? ''} disabled className="bg-muted text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">Email is set from your account and cannot be changed here</p>
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Tell something about yourself..."
                  rows={3}
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          {/* QR Code */}
          <Card>
            <CardHeader><CardTitle className="text-base">Your QR Code</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center gap-2">
              <div className="rounded-xl bg-white p-4">
                <QRCodeSVG value={user?.id || ''} size={160} level="M" />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Others can scan this to connect with you
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
