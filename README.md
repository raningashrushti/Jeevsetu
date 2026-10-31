# JeevSetu 🐾
### Animal Rescue Reporting and Volunteer Coordination

JeevSetu is a full-stack web application designed to help people report
animals in need and help authorized volunteers review and coordinate
those reports.

People can submit reports using text or voice input. Approved
volunteers can access a dashboard to review reports, search cases,
filter by status, and update their progress.

JeevSetu is a volunteer-coordination project. Reports require human
review; the application does not automatically dispatch rescue teams
or provide emergency services.

## Features

### Public Animal Reporting
- Submit reports for dogs, cats, birds, and other animals.
- Enter the location and description of an incident.
- Validate required fields before submission.
- Receive a warning when a similar unresolved report exists.

### Voice-Based Reporting
- Record a report through the browser.
- Convert speech to text using Gnani AI speech-to-text.
- Supports Marathi, Hindi, English, and Hinglish input.
- Review and edit the transcription before submitting.

### Volunteer Dashboard
- Volunteer login using Supabase Authentication.
- Backend verification of Supabase access tokens.
- Access restricted to approved volunteer email addresses.
- Search and filter submitted reports.
- Update report status.

### Report Status Workflow
- New
- Reviewing
- Assigned
- Resolved

### Database
- Reports are stored in Supabase PostgreSQL.
- Report data is accessed through the Node.js backend.
- Supabase credentials used for database access remain server-side.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Styling | CSS |
| Icons | Lucide React |
| Backend | Node.js, Express.js |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Speech-to-Text | Gnani AI Prisma v3.0 |
| API Communication | HTTP / REST |

## Project Structure

```text
JeevSetu/
├── client/
│   ├── src/
│   │   ├── VolunteerLogin.jsx
│   │   ├── main.jsx
│   │   ├── styles.css
│   │   └── supabase.js
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── gnani.js
│   │   ├── index.js
│   │   └── store.js
│   ├── .env.example
│   └── package.json
│
├── package.json
├── package-lock.json
└── README.md