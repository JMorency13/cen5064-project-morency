---
name: "Structured Peer Review (conference day)"
about: "Filed by your review partner on Oct 12, Oct 19, Nov 9, or Nov 16 — complete every section before the session ends."
title: "Peer Review — [midterm|final] round — [reviewer GitHub username]"
labels: peer-review
---

**Reviewer:** @your-username
**Round:** midterm (Oct 12/19) | final (Nov 9/16)
**Commit reviewed:** [paste the short SHA of the latest commit you looked at]

## 1. Does it run as documented?

I cloned the repo and followed the README's "How to run" section literally.

- [ ] Yes — it built and ran.
- [ ] Partially — it ran after I fixed something the README didn't mention:
- [ ] No — it failed at this step:

[If partially/no: paste the exact command and error.]

## 2. Do the diagrams match the code?

Compare the README's tier table / C4 / UML against the actual source.

[Name ONE concrete match ("the Service layer really is separate from the UI,
as the container diagram claims") OR one concrete mismatch ("the class diagram
shows a Repository interface, but the service calls the database directly").]

## 3. One genuine strength

[Something specifically good — a clean boundary, a well-scoped feature,
a readable module, a smart ADR. "Looks good" without a location earns nothing.]

## 4. One design concern, with a suggested fix

[A coupling problem, a SOLID smell, a scope risk, a missing test — plus what
you would do about it. Point at a file or class.]

## 5. One interview question

[The question YOU would ask this student about their system in a design
interview. They may actually get asked it in their check-in.]
