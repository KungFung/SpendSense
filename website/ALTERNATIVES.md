# Person 3: Social Mobility and Better Alternatives demo

Open `website/index.html` in a browser, then choose **Explore alternatives**
in the sidebar. No install, API key or server is needed. All eight listings
are fictional, and profile selections are kept in memory only.

## Try it

1. Start with Manchester, a £10 budget, Student and no interests checked.
   Expect two activities, one training example and one student job example.
2. Switch to Liverpool. Expect Liverpool cards only: two activities and one
   training example. The job in this city targets workers in the demo.
3. Set the budget to £0. The paid art activity disappears; the free walk and
   training remain.
4. Select Worker. The Liverpool job appears alongside training, even at £0.
5. Select Careers. Only matching future opportunities remain. Uncheck it,
   then select Outdoors: only the free walk remains. Empty sections explain
   how to broaden the search.
6. Clear the budget or enter a negative value. Expect a budget validation
   message rather than misleading suggestions.
7. Visit Home, Plan a purchase and My Pact. Plan a fictional £40 purchase and
   check its cooldown. Existing demo controls and simulated holds still work.

## Recommendation rules

- Match the selected city and student/worker audience.
- Apply the budget only to activities; jobs and training are independent.
- With interests selected, require at least one matching tag. No selections
  means all interests. No AI or hidden ranking is used.
- Include reasons with every result. Audiences describe invented demo
  targeting, not real eligibility.

## Integration for teammates

Load `js/opportunities-data.js`, then `js/alternatives.js`. The recommendation
function does not need the interface, browser storage or a backend:

```js
const suggestions = recommendOpportunities({
  city: "Manchester",
  budget: 0, // non-negative GBP activity budget
  status: "student", // "student" or "worker"
  interests: ["careers"], // [] means all interests
});
// suggestions.feelBetterToday and suggestions.buildMyFuture are arrays.
// Each record includes reasons: an array of plain-English explanations.
```

An optional `purchaseContext` field may be passed but is currently ignored.
Connecting Bad Day Mode is a later task. The interface code is separate in
`js/alternatives-ui.js`. It reuses the existing money helper and card styles.

## Automated checks

From the repository root, with Node.js installed:

```text
node --test scripts/alternatives.test.cjs scripts/alternatives-ui.test.cjs
```

These checks use Node's built-in tools; no packages are needed. The interface
test uses a lightweight DOM substitute to check script startup, input events,
navigation, planning and simulated purchases. It does not verify real-browser
layout, keyboard behaviour or appearance; use the manual checks above too.
