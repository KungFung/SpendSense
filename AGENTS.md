# PACT — NatWest Hackathon Project

## Project Overview

PACT is an AI-powered financial wellbeing application being developed by a team of five for a university hackathon sponsored by NatWest.

Our main goal is to help people avoid harmful impulsive spending, especially during emotionally difficult days, while helping them improve their long-term financial wellbeing.

This is a hackathon MVP, NOT a production banking application.

## Core Features

### 1. CSV Bank Statement Analysis
- Users upload bank statements as CSV files.
- Analyse historical transactions to establish spending baselines.
- Calculate averages, categories and spending frequency.
- Detect potentially unusual purchases compared with typical spending habits.
- Distinguish between essential, discretionary and uncertain transactions where possible.
- Do not assume unusual spending automatically means harmful spending.

### 2. Bad Day Mode
- Users can voluntarily indicate how they are feeling.
- Users set their own spending boundaries.
- PACT identifies purchases that may conflict with their chosen limits or usual behaviour.
- Provide empathetic, non-judgemental feedback.

### 3. Cooldown and Purchase Approval
- Simulate a cooling-off period before certain purchases.
- Let users review their spending decisions.
- Allow users to continue, cancel or explore alternatives.
- Do not attempt real banking transactions or payment interception.

### 4. Social Mobility and Better Alternatives (MY RESPONSIBILITY)
- Recommend free or affordable activities as alternatives to impulsive purchases.
- Help users discover relevant local opportunities to improve their financial circumstances.
- Examples include jobs, apprenticeships, free training, bursaries, career development programmes and community activities.
- Recommendations should consider location, budget, interests and whether the user is a student or worker.

### 5. Savings Pots
- Simulated savings pots for goals such as emergencies, holidays and essential expenses.
- Allow users to allocate money they choose not to spend.
- Show progress towards savings goals.

### 6. Scam Intelligence
- Identify potential warning signs in suspicious messages or payment requests.
- Explain risks clearly without guaranteeing that a message is safe or fraudulent.

### 7. Gamification
- Encourage positive financial habits with streaks, badges and milestones.
- Vouchers may be explored as a future feature.
- Avoid shaming users or encouraging unnecessary spending.

## My Role — Person 3

I am responsible for building the Social Mobility and Better Alternatives feature.

My work must integrate into the team's existing PACT application rather than creating a separate app.

### Better Alternatives
When a customer is having a bad day and considers spending £40 on takeaway, PACT could suggest:
- Free sports or football activities
- Affordable meals
- Free community events
- Parks, walks and other low-cost activities
- Activities based on the customer's interests and location

### Social Mobility
Recommend opportunities that could help users improve their long-term financial circumstances:
- Part-time employment
- Apprenticeships
- Free skills courses
- University hardship funds and bursaries
- Career development events
- Training and mentoring opportunities

### Personalisation
Use the following customer information where available:
- City or approximate postcode area
- Budget
- Interests
- Student or worker status
- Optional purchase context from Bad Day Mode

Begin with manual city selection. Do not require GPS or precise location.

## My Development Roadmap

1. Inspect the existing cloned repository and identify its tech stack and architecture.
2. Identify existing components, files and APIs relevant to my feature.
3. Agree the input/output interface with the other team members.
4. Create a small dataset of fictional opportunities for initial testing.
5. Implement recommendation filtering by location.
6. Implement budget filtering for activities.
7. Personalise recommendations by interests and student/worker status.
8. Display recommendations in the application's existing frontend.
9. Connect recommendations to the Bad Day and cooldown flow.
10. Add verified real-world opportunities if time permits.

## Coding Instructions for Codex

- I am a beginner programmer. Explain everything in simple English.
- Before implementing anything, inspect the existing repository.
- Identify the actual programming languages, frameworks and structure.
- Do not assume we are using React, Python or any other technology.
- Reuse existing project conventions and dependencies where practical.
- Do not create a separate app unless explicitly requested.
- Do not rewrite or modify teammates' features unnecessarily.
- Make the smallest changes possible.
- Break implementation into small, individually testable tasks.
- Implement only one task at a time unless instructed otherwise.
- Explain why each file is needed.
- Explain what changed after implementing each task.
- Provide simple instructions for running and testing the feature.
- Explain errors in beginner-friendly language.
- Never assume an API key is already configured.
- Explain why any additional dependency is needed before installing it.
- Use fictional customer data and transactions during development.
- Do not invent real job listings, events or financial support eligibility.
- Use transparent recommendation rules before considering complex AI.
- Keep financial and location data private.
- Never commit API keys, passwords or personal financial data to GitHub.
- Do not start coding until I explicitly approve the implementation.

## Team Collaboration

This repository is shared by five developers.

- Work on my assigned feature without disrupting teammates' work.
- Preserve the existing project structure.
- Check existing files before creating duplicates.
- Keep code modular and easy to integrate.
- Coordinate shared API contracts and changes.
- Do not make destructive Git changes.
- Do not push directly to main.
- Explain which files have changed before suggesting a commit.

## Immediate Instruction

When I first open Codex:

1. Read this AGENTS.md file.
2. Inspect the existing repository.
3. Explain the tech stack and project structure in beginner-friendly terms.
4. Identify the best location for my feature.
5. Propose the smallest possible Social Mobility and Better Alternatives MVP.
6. Break the implementation into small, testable tasks.

Do not change files or install dependencies until I approve.
