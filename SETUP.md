# ChatApp - Setup Instructions

## Prerequisites
- Node.js installed
- Supabase account

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase

The app requires Supabase environment variables to function. You have two options:

#### Option A: Use Existing Supabase Project
1. Go to https://supabase.com/dashboard
2. Select your project (ID: eeyjpynlhyeqxmoxdlko) or create a new one
3. Go to Settings → API
4. Copy the Project URL and anon/public key
5. Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

#### Option B: Use Local Supabase
```bash
npx supabase start
```
Then use the local URL and key provided.

### 3. Run Database Migrations

If using a cloud Supabase project, apply the migrations in the `supabase/migrations/` folder through the Supabase dashboard SQL editor or CLI.

### 4. Start Development Server
```bash
npm run dev
```

The app will be available at http://localhost:8080

## Features Implemented

✅ **Authentication**
- User signup and login
- Session management
- Protected routes

✅ **Profile Management**
- Edit display name, bio, and phone
- Upload avatar
- QR code for easy sharing
- Online status tracking

✅ **Contacts**
- Search users by email, name, or phone
- Send connection requests
- Accept/reject requests
- Block connections
- Direct contact add feature

✅ **Direct Messaging**
- Real-time messaging
- Typing indicators
- Read receipts
- File attachments (images, documents)
- Message history

✅ **Group Chat**
- Create groups with member selection
- Search and add members by email
- Admin controls (add/remove members)
- Real-time group messaging
- File attachments in groups
- Member management

✅ **UI/UX**
- Responsive design (mobile & desktop)
- Dark/light theme support
- Smooth animations
- Modern shadcn/ui components
- Toast notifications

## Database Schema

The app uses the following main tables:
- `profiles` - User profiles
- `connections` - Friend connections
- `conversations` - 1-on-1 conversations
- `direct_messages` - Direct messages with attachments
- `groups` - Group chats
- `group_members` - Group membership
- `group_messages` - Group messages with attachments

## Storage Buckets

- `avatars` - User profile pictures
- `chat-attachments` - Message attachments

## Troubleshooting

**App not loading?**
- Ensure `.env` file exists with correct Supabase credentials
- Check browser console for errors
- Verify Supabase project is active

**Can't send messages?**
- Check user is authenticated
- Verify RLS policies are applied
- Check database migrations are run

**File upload not working?**
- Ensure storage bucket exists
- Check storage policies are applied
- Verify file size limits (50MB max)
