# Manual savings pots demo

Start the existing app with `npm.cmd run dev`, open the local dashboard
(normally `http://127.0.0.1:5173/index.html`) and select **Savings pots**.
No new dependencies or API keys are needed.

## What this version does

- Starts with £200 of fictional available money, separate from real accounts,
  statements, purchases and the existing "money kept" counter.
- Creates named pots in four categories with an optional target.
- Moves money between the available balance and a chosen pot. It never creates
  extra money: available money plus all pot balances always equals £200.
- Stores money as integer pennies to avoid decimal rounding errors.
- Remembers pots, balances and targets in this browser using `pact.pots.v1`.
  No personal data is sent to a server. Another browser/device has its own demo.
- Displays a warning if saving is unavailable or saved data cannot be loaded.
  Invalid saved data is replaced with a fresh demo only when the next successful
  action saves. The normal PACT demo-reset button does not reset pots.

## Manual test

1. Create **Emergency fund**, category **Emergency fund**, target **£100**.
   A new pot starts at £0; available money is still £200.
2. Enter **50** on the pot and choose **Add money**. Expect £50 in the pot,
   £150 available and 50% progress.
3. Try adding **151**. Expect an error and no balance change.
4. Try taking **51** out. Expect an error and no balance change.
5. Take **10** out. Expect £40 in the pot and £160 available.
6. Refresh. The name, target and balances should remain.
7. Create a second pot without a target. Creating it moves no money.
8. Try creating a pot with the same name (including different capitalisation).
   Expect a helpful error, not a duplicate pot.
9. Test £0, negative values and more than two decimal places. None should move
   money. Browser validation may show its own input message first.
10. Check Home, the graph, Plan a purchase and Explore alternatives still work.

With storage disabled, actions still work for this visit, with a visible warning.
Clearing site storage also clears this demo; use fictional data only.

## Files and integration

- `js/pots.js`: pure creation/transfer rules, validation and storage helpers.
- `js/pots-ui.js`: forms, pot cards, progress and browser storage integration.
- `css/pots.css`: styles scoped to the pots screen.
- `index.html`: navigation, screen markup and script/style loading.
- `js/app.js`: adds the Savings pots navigation title only.
- `../scripts/pots.test.cjs`: arithmetic, validation and storage regression checks.

The reusable functions return a new state; they do not change their inputs:

```js
let demo = PactPots.initialState();
demo = PactPots.createPot(demo, {
  name: "Emergency fund", category: "emergency", target: "100",
});
demo = PactPots.transfer(demo, demo.pots[0].id, "50", "add");
demo = PactPots.transfer(demo, demo.pots[0].id, "10", "withdraw");
// Amount strings are pounds. State balances and targets are pennies.
```

Statement-based allocation, suggested splits and the alternatives-to-pots action
are not included in this version. Any later allocation must move existing
available money rather than crediting the same saving twice.

Run checks from the repository root:

```text
node --test scripts/pots.test.cjs scripts/alternatives.test.cjs scripts/alternatives-ui.test.cjs
npm.cmd run build
```

The build checks the separate React chart. Pots run as ordinary scripts in
`index.html`; they are covered by the Node checks and manual browser testing.
