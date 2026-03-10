# Copilot Instructions for Konglo Digital

## Context
Konglo Digital is a central web platform for digital tools used in a makerspace / association.

Goals:
- digitize cumbersome processes
- bring scattered tools into one place
- unify workflows
- simplify self-service and administration

## Rules 

### Do
- Keep code easy to edit (clear names, small files).
- Prefer standard HTML/CSS/JS patterns.
- Make incremental changes; avoid rewrites.
- Prefer composition over clever abstractions.
- Keep code readable for both designers and developers.
- If my prompts conflict with requirements, stop and propose options and explain the tradeoffs.
- Copilot must follow these instructions deterministically (no guessing, no creative inference).
- If a task is ambiguous, underspecified, or requires business or technical assumptions, ask clarifying questions before changing code.
- State the exact assumptions or ambiguities explicitly instead of silently picking one interpretation.
- Do not implement from assumptions unless I explicitly approve those assumptions or ask you to proceed with best judgment.
- use approachable and friendly language in the UI


### Don’t (STRICT — violations fail the output)
- Don’t invent extra features, screens, or copy without approval
- Don’t add new libraries unless explicitly requested.
- Don’t add dependencies without approval.
- Don’t change routing/state architecture without asking.
- Don’t fabricate APIs, analytics, auth, or business logic.
- Don’t silently resolve ambiguous requirements by guessing.
- Don't spread domain logic across UI components. Keep it as centralized and testable as possible.

### If you think a rewrite is needed
Stop and propose:
- Option A: minimal patch (preferred)
- Option B: refactor/rewrite (only with approval)

## Care and Accuracy
Since the platform handles member and financial data:
- check permissions carefully
- show sensitive data sparingly
- make critical changes traceable
- be especially careful with financial processes

## Conventions
- Naming:  
    - Components: camelCase  
    - Styles: BEM
- Reuse rules:  
- Create a component when: used 2+ times OR conceptually important  
- Keep inline when: single-use and small
- Accessibility baseline:  
    - Labels for inputs  
    - Proper headings  
    - Keyboard navigation for interactive elements  
    - Visible focus

## Behavior rules
- Data: mock data unless real endpoints are provided
- Forms: basic validation only (unless specified)
- Include empty/loading/error only when relevant to scenario
- Responsiveness: breakpoints at >1280px for desktops, 768px-1024px for tablets and <768px for
mobile devices. These breakpoints are separate from browser targets and simply define the switch points for layout adaption.
- Fidelity: strive for pixel-perfect, but do not use magic numbers that are not present in my Figma file or in the design tokens

## Clarification policy
- Ask first when requirements have multiple plausible interpretations.
- Ask first when a requested behavior conflicts with existing code, naming, data shape, or API usage.
- Ask first when the change touches financial data, permissions, invoice logic, or other sensitive flows and the expected behavior is not explicit.
- Ask first when you would otherwise need to infer field mappings between UI labels, database fields, and third-party API fields.
- Before implementing, present the specific open questions as a short list and wait for the answer.
- If the user explicitly says to proceed without questions, you may continue, but list the assumptions you are making.

# Output contract
Every response must include:
1. Plan (what will change and why)
2. Assumptions + open questions (and "Needs confirmation" items)
3. Self-check:   
- Yes/No: Followed stack and conventions   
- Yes/No: No new dependencies   
- Yes/No: Incremental edits (no rewrite)   
- Yes/No: No scope creep / invented features   

## Default prompting style (how to work)
# Default prompting style
- Default to short, actionable responses.
- Prefer small, scoped requests (one change at a time).
- When asked to "improve", or generate a "best", propose 2–3 options and explain the tradeoffs.
- When something is missing, ask before inventing.
- When something is ambiguous, ask before implementing.