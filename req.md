You are a Senior Staff Software Engineer and Product Designer.

I am building a production-grade Omnichannel Customer Engagement Platform (similar to Intercom, Chatwoot and Zendesk).

Tech Stack

Frontend
- React 19
- TypeScript
- Vite
- React Router
- Zustand
- TanStack Query
- TailwindCSS
- shadcn/ui

Backend
- Express.js
- TypeScript
- Prisma
- PostgreSQL
- Socket.IO
- Gmail API
- Meta WhatsApp Cloud API
- Meta Instagram Messaging API

IMPORTANT

The project is already partially implemented.

There are already:
- Multiple frontend pages
- Backend APIs
- Prisma models
- Database schema
- Authentication
- Some channel integrations

Do NOT recreate everything from scratch.

Instead, analyze the existing codebase and RESTRUCTURE it into a clean, scalable architecture while preserving the existing functionality.

==================================================
GOAL
==================================================

Refactor the project into a production-ready SaaS architecture.

Focus on

- Better folder structure
- Better separation of concerns
- Better naming
- Reusable components
- Modular architecture
- Clean code
- Enterprise-grade UI

Do not break existing APIs unless absolutely necessary.

==================================================
BACKEND REQUIREMENTS
==================================================

Restructure the backend into

backend/

src/

    app.ts
    server.ts

    config/

    routes/

    controllers/

    services/

    repositories/

    middleware/

    validators/

    adapters/

        shared/

        whatsapp/

        instagram/

        gmail/

    sockets/

    jobs/

    utils/

    constants/

    types/

prisma/

tests/

Requirements

• Controllers should only handle HTTP requests.

• Services should contain business logic.

• Repositories should contain all Prisma queries.

• External providers (WhatsApp, Instagram, Gmail) must exist only inside adapters.

• Services should communicate through interfaces instead of directly calling external providers.

• Reuse the existing APIs whenever possible.

• Move existing files into the appropriate folders instead of rewriting them.

==================================================
FRONTEND REQUIREMENTS
==================================================

Restructure the frontend into

src/

api/

assets/

components/

    common/

    ui/

    layouts/

    conversation/

    customer/

    inbox/

    settings/

hooks/

providers/

routes/

store/

types/

utils/

pages/

    public/

    private/

Move the existing pages into this structure instead of recreating them.

==================================================
PUBLIC PAGES
==================================================

Login

OAuth Callback

Unauthorized

404

==================================================
PRIVATE PAGES
==================================================

Dashboard

Inbox

Conversation

Contacts

Customer Profile

Unified Customer

Analytics

Channels

Settings

Integrations

WhatsApp

Instagram

Gmail

Team

Profile

Account

Activity Logs

Search

If any page already exists, reorganize it instead of recreating it.

==================================================
LAYOUT
==================================================

Public Layout

Private Layout

Private layout should contain

Sidebar

Top Navbar

Main Content

Optional Right Customer Panel

Use nested routing.

==================================================
CUSTOMER UNIFICATION
==================================================

The platform should unify customers across

WhatsApp

Instagram

Email

Every customer should have

Email

Phone

Identifiers

Connected Channels

Unified Timeline

Internal Notes

Tags

Conversation History

==================================================
DESIGN
==================================================

Do NOT redesign the product.

Improve the existing UI.

Maintain consistency.

No animations.

No gradients.

No glassmorphism.

No neumorphism.

Premium enterprise SaaS appearance.

Minimalistic.

Professional.

Clean spacing.

Good typography.

Excellent information hierarchy.

==================================================
COLOR PALETTE
==================================================

Light

Background
#F8FAFC

Surface
#FFFFFF

Sidebar
#FFFFFF

Border
#E2E8F0

Primary
#2563EB

Primary Hover
#1D4ED8

Success
#16A34A

Warning
#D97706

Danger
#DC2626

Text Primary
#0F172A

Text Secondary
#475569

Muted
#94A3B8

Dark

Background
#0F172A

Surface
#111827

Sidebar
#111827

Border
#1F2937

Primary
#3B82F6

Primary Hover
#2563EB

Success
#22C55E

Warning
#F59E0B

Danger
#EF4444

Text Primary
#F8FAFC

Text Secondary
#CBD5E1

Muted
#64748B

==================================================
COMPONENTS
==================================================

Create reusable

Buttons

Inputs

Tables

Cards

Dialogs

Dropdowns

Badges

Pagination

Loading Skeletons

Empty States

Search Components

Toast Notifications

==================================================
STATE MANAGEMENT
==================================================

Use

Zustand

TanStack Query

React Context only for global providers.

==================================================
OUTPUT
==================================================

First analyze the existing project.

Then produce

1. Problems in the current architecture.

2. Recommended architecture.

3. Complete backend folder tree.

4. Complete frontend folder tree.

5. File-by-file migration plan.

6. Which existing files should be moved.

7. Which files should be renamed.

8. Which files should be deleted.

9. Which reusable components should be created.

10. Which APIs should be merged or separated.

11. Which pages should remain unchanged.

12. Which pages should be redesigned.

13. Which folders should be introduced.

Do NOT rewrite working code unnecessarily.

Prioritize restructuring over rewriting.

Preserve existing functionality while making the project production-ready and easy to maintain.