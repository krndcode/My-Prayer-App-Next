# My Prayer Line

My Prayer Line is a JavaScript/Next.js App Router application with Firebase-backed authentication and workspaces for prayer groups, schedules, the Heat Room, and profile settings.

The Firebase project currently connected to this workspace is `my-prayer-line-20261016`.

## Local setup

1. Install Node.js 22 (the app also requires Node.js 20.9 or newer).
2. Install app dependencies with `npm install`.
3. Copy `.env.local.example` to `.env.local` beside `package.json`. Fill in the six Firebase client values from **Firebase Console → Project settings → Your apps**. Keep each variable on its own line.
4. In **Firebase Console → Authentication → Sign-in method**, enable Email/Password. Add local and production hostnames under **Authorized domains** so verification and password-reset emails can return to the app.
5. Create a Cloud Firestore database with ID `default` in your chosen region.
6. Configure Firebase Admin credentials for the server using one of:
   - Application Default Credentials in a trusted Google Cloud runtime, with `FIREBASE_ADMIN_PROJECT_ID`; or
   - `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account JSON key kept outside source control; or
   - `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from a service account, stored in the deployment secret store.

   The Admin identity needs Firebase Authentication user-management permissions and Firestore read/write access for session creation, invitations, moderation, and account deletion. If profile avatars are enabled, it also needs permission to delete objects from the configured Storage bucket. Do not use a `NEXT_PUBLIC_` prefix for Admin credentials.
7. Enable Firebase Storage if avatar uploads are needed.
8. Deploy Firestore rules and indexes with `firebase deploy --only firestore:rules,firestore:indexes`. Deploy Storage rules after enabling Storage with `firebase deploy --only storage`.
9. Start the app with `npm run dev`.

The Admin SDK accepts `NEXT_PUBLIC_FIREBASE_PROJECT_ID` as a project ID fallback. A service-account private key stored in an environment variable should retain escaped `\n` line breaks; the server initializer converts them.

This project targets Firestore database ID `default` (not Firestore's `(default)` database). The client initializer, Admin initializer, Functions, and `firebase.json` must use the same ID.

## Implemented features

- **Prayer groups:** Discover and search public groups, create groups, join or leave, manage membership as a group administrator, and exchange member-only real-time messages in a dedicated chat workspace. Chat loads the latest 40 messages and paginates older history on demand. Group administrators can permanently delete a group and its messages, memberships, schedules, calls, and related notifications.
- **Schedules:** Create, edit, and cancel sessions; share them with a joined group or invite selected members of a group to a private session. Invitees can accept or decline and RSVP. Recurrence supports daily, weekly, or monthly sessions (up to 52 occurrences) while preserving local wall time across daylight-saving changes. Times are stored as UTC timestamps alongside an IANA time-zone identifier.
- **Prayer calls:** Start private one-to-one audio or video internet calls from a group chat. Calls use Wi-Fi or mobile data, not carrier minutes. Firestore rules protect session signaling; audio/video media travels directly between browsers over WebRTC.
- **Heat Room:** Publish prayer requests and testimonies to the community, a joined group, or yourself; post requests anonymously; acknowledge prayer, react to testimonies, reply, and report a post. Audience checks are enforced by Firestore rules. Anonymous author IDs are stored separately in an owner-only moderation document.
- **Profile:** Update display name, phone number, biography, avatar, verified email, password, notification preferences, and the default audience for new posts. Avatars are limited to JPEG, PNG, or WebP files up to 5 MB.
- **Account deletion:** Requires typing `DELETE` and reauthentication within five minutes. Private/profile data, authored group messages, comments, and reports are removed; shared prayer requests and testimonies are retained with the author anonymized; group ownership is transferred to the earliest remaining member when possible; owned group sessions are transferred and cancelled, or deleted with an empty group; private sessions are deleted.
- **Moderation:** Users can report posts. A moderator review page is available to accounts with the Firebase Auth custom claim `moderator: true`.
- **Notifications:** The app includes a notification inbox, browser push enrollment, Cloud Functions source for group, schedule-invitation, and incoming-call notifications, plus a scheduled reminder processor. Reminders account for future occurrences in recurring schedules and preserve the selected time zone. Notification text does not include prayer content.

The main Firestore collections include `users`, `prayerGroups` (with `members` and `messages`), `prayerSchedules` (with `attendance` and private `invitations`), `callSessions` (with ICE `signals`), `prayerRequests`, `testimonies`, `reports`, `notifications`, and `deviceTokens`. Group membership/count changes use Firestore transactions.

## Optional Firebase services

### Web push and App Check

To enable browser push:

1. In **Firebase Console → Project settings → Cloud Messaging**, configure Web Push certificates and copy the VAPID public key to `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
2. Add the app's public Firebase configuration to `.env.local`; the service worker reads it from `/api/firebase/public-config`.
3. Use a supported browser on HTTPS (or localhost), allow notification permission, and enroll each device from Profile.

App Check is optional. Register the web app with reCAPTCHA v3 in **Firebase Console → App Check**, set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, and add the application domains in reCAPTCHA. Before enforcing App Check in Firebase, verify every client surface that accesses protected Firebase services is initialized with App Check.

### Cloud Functions

Functions are in `functions/` and target Node.js 22. Install their dependencies and deploy them with:

```sh
npm install --prefix functions
firebase deploy --only functions
```

Scheduled reminders require the Firebase/Google Cloud project to have billing enabled and the Cloud Scheduler/Functions APIs available. Configure billing and required APIs in the Firebase/Google Cloud consoles before deploying. For the currently connected project, billing is disabled and the Cloud Functions, Cloud Scheduler, Cloud Run, Cloud Build, Artifact Registry, and Eventarc APIs are disabled; the current Firebase CLI identity also cannot enable APIs. Notification and reminder delivery is not active until Functions have been deployed successfully.

### Moderator access

From an environment with trusted Application Default Credentials and the Admin project ID configured, grant a moderator claim with:

```sh
node scripts/grant-moderator.mjs <firebase-auth-uid>
```

The moderator must sign in again for the updated custom claim to appear in their ID token. Only grant this claim to trusted accounts.

## Call setup notes

Calls start from the audio/video controls in a group chat and use public STUN servers for direct peer-to-peer connectivity. Some restrictive networks require a TURN relay, which is not configured; test on the intended networks and set up a trusted TURN provider before relying on calls for all users. Peer-to-peer calls expose network IP addresses to the other participant. Calls are limited to members of a shared prayer group.

## Remaining setup

- Email notifications are not integrated with an email delivery provider.
- Browser calling has not been exercised with cameras and microphones on real devices. Avatar upload, push delivery, and App Check enforcement also depend on additional Firebase project configuration and have not been end-to-end validated. The moderator review API was integration-tested with temporary accounts; production moderator provisioning still requires granting the custom claim to trusted users.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. Deploy the current Firestore rules and indexes before using the Firestore-backed features. The schedule invitation collection-group query depends on the recursive invitations read rule in `firestore.rules`.
#   M y - P r a y e r - A p p - N e x t  
 