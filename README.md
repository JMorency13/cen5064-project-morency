Event Management System

<!-- CI badge: after Session 4, replace ORG/REPO and the workflow filename, then uncomment:
![CI](https://github.com/ORG/REPO/actions/workflows/ci.yml/badge.svg)
-->

**Student:** [Jonathan Morency] · **Course:** CEN 5064 Software Design, Fall 2026 · **Partner:** [@cmend137]

## Project (approval paragraph — write this by Sun Aug 30)

Project Name: Event Management System
This is a web-based application is designed for university student organizations to create, organize, and RSVP 
events. It will centralize the event information through a dashboard where the user can view upcoming events, manage 
existing events and track attendance. This system will be for student organization administrators and members. 3 main 
features of the system would be 1, the homepage dashboard; 2, the event creation and management feature which will enforce
the business rules such as preventing overlapping event schedules and venues, as well as locking events when they reach full 
capacity; and 3, the event notification feature shown through an in-app banner that will notify organization administrators 
of any changes to the amount of members currently RSVP'd to an event, and notify organization members of any changes to 
the time and place of a venue they RSVP'd or if the event had been cancelled.

[One paragraph: What is the system? Who is it for? What are its 3–4 core features?
This paragraph is your approval request — see the Project Brief, Section 2.]

## How to run

```
[Exact commands to build and run your system from a clean clone.
Update this every time the steps change — your partner and your
instructor will follow it literally on conference days.]
```

## Architecture

### Tier breakdown (Session 2 studio)

| Tier | Responsibilities in THIS system |
|------|--------------------------------|
| Presentation | [what your UI layer does] |
| Service | [what your use-case/orchestration layer does] |
| Domain | [your entities and business rules] |
| Data | [how and where data is stored] |

### C4 — Context & Container (Session 3 studio)

```mermaid
flowchart TB
  user["User (Organizer / Member)"] -->|uses| system["Event Management System"]
  system -->|authenticates via| auth["University SSO / Identity Provider"]
  system -->|sends email via| email["Email Service (SMTP / 3rd-party)"]
  system -->|optionally syncs with| calendar["Calendar Service (Google / Outlook)"]
```

```mermaid
flowchart TB
  user["User (Organizer / Member)"] -->|uses| ui["Web UI / Client<br/>(Presentation)"]

  subgraph EMS["Event Management System"]
    ui -->|calls| api["API Server (Express)<br/>(Service & Orchestration)"]
    api -->|enforces rules via| domain["Domain Module (Event rules)"]
    api -->|reads / writes| db["Database / File store<br/>(Data)"]
    api -->|pushes realtime| realtime["Realtime Notifications<br/>(WebSocket / SSE)"]
  end

  api -->|auth checks via| auth["University SSO / Identity Provider"]
  api -->|sends email via| email["Email Service (external)"]
  api -->|optionally writes to| calendar["Calendar Service (external)"]
```

### UML — Class & Sequence (Session 3 studio)

```mermaid
classDiagram
    class User {
        -id: String
        -name: String
        -email: String
        -role: String
        +viewDashboard()
        +rsvpFor(event: Event)
    }

    class Organizer {
        +createEvent()
        +updateEvent()
        +cancelEvent()
        +viewAttendance()
    }

    class Event {
        -id: String
        -title: String
        -venue: String
        -startTime: Date
        -endTime: Date
        -capacity: Integer
        -rsvps: List~String~
        -status: String
        +isFull(): Boolean
        +overlapsWith(other: Event): Boolean
        +addRsvp(userId: String): Boolean
        +removeRsvp(userId: String)
        +lockIfFull()
    }

    class Notification {
        -id: String
        -type: String
        -message: String
        -timestamp: Date
        +sendToUser(user: User)
    }

    User <|-- Organizer
    User --> Event : views / RSVPs
    Organizer --> Event : creates / manages
    Event --> Notification : triggers
```

```mermaid
sequenceDiagram
    actor O as Organizer
    actor M as Member
    participant UI as Web UI
    participant API as API Server
    participant D as Domain Rules
    participant DB as Database
    participant N as Notification Service

    O->>UI: Create event form
    UI->>API: POST /events
    API->>D: validate event details
    D->>DB: check venue conflicts / capacity
    DB-->>D: no conflicts
    D-->>API: valid event
    API->>DB: save event
    DB-->>API: saved
    API-->>UI: event created

    M->>UI: RSVP to event
    UI->>API: POST /events/:id/rsvp
    API->>D: addRsvp(userId)
    D->>DB: check current RSVPs / capacity
    DB-->>D: status
    D-->>API: RSVP accepted or locked
    API->>DB: persist RSVP
    API->>N: send in-app / email alert
    API-->>UI: success or full/locked message
```

## Architecture Decision Records

Decisions live in [`docs/adr/`](docs/adr/). Start with ADR-001 in Session 4.

| # | Decision | Status |
|---|----------|--------|
| [001](docs/adr/adr-001.md) | [What I am building and why] | [proposed] |

## Weekly log (optional but recommended)

A one-line note per week keeps your commit story readable:

- Week 1 (Aug 24): repo created, three ideas drafted
- Week 2 (Aug 31): ...
