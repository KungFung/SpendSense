// Pact — hold screen.   OWNER: Person 3 (rules and hold screen)
//
// BASIC VERSION written for the demo. Extend it freely.
// When checkPurchase() returns "hold": dim the screen, show the amount, the rule
// and when it was set, play the user's voice note, and offer:
// Wait 24h · Plan it instead (addPlan in plan.js) · Cancel · Message Sam · Emergency.
//
// Voice note: put a recording at website/audio/voice-note.mp3. Use a real
// recording of the person, never an AI-cloned voice (PROJECT.md, section 2.1).

let activeHold = null;

function showHold(hold) {
  activeHold = hold;
  $("hold-amount").textContent = money(hold.amount);
  $("hold-shop").textContent = hold.shop;
  $("hold-rule").textContent = hold.planId ? hold.ruleText : `Rule: ${hold.ruleText} · you set this on 3 Oct`;
  $("hold-reason").textContent = hold.reason || "";
  $("hold-reason").hidden = !hold.reason;
  $("hold-plan").hidden = Boolean(hold.planId); // already planned
  $("hold-overlay").hidden = false;
  playVoiceNote();
}

function closeHold() {
  $("hold-overlay").hidden = true;
  $("voice-note").pause();
  activeHold = null;
}

function playVoiceNote() {
  const audio = $("voice-note");
  audio.currentTime = 0;
  // No recording yet, or autoplay blocked: the written message still shows.
  audio.play().catch(() => {});
}

function removeHold(id) {
  holds = holds.filter((h) => h.id !== id);
  save("pact.holds", holds);
  renderHolds();
}

// The three main decisions, shared by the hold screen and the dashboard card.
function waitOnHold() {
  closeHold();
  toast("⏳ Saved for the morning", "It's on your dashboard. Decide when you've slept on it.");
}

function planHold(hold) {
  addPlan(hold.shop, hold.amount);
  removeHold(hold.id);
  closeHold();
  render();
  toast("📅 Cooling-off started", `${hold.shop} is now a planned purchase.`);
}

function cancelHold(hold) {
  kept += hold.amount;
  save("pact.kept", kept);
  removeHold(hold.id);
  closeHold();
  render();
  toast("❌ Cancelled", `${money(hold.amount)} kept by changing your mind.`);
}

$("voice-play").addEventListener("click", playVoiceNote);
$("hold-wait").addEventListener("click", waitOnHold);
$("hold-plan").addEventListener("click", () => activeHold && planHold(activeHold));
$("hold-cancel").addEventListener("click", () => activeHold && cancelHold(activeHold));
$("hold-sam").addEventListener("click", () => {
  toast("💬 Sent to Sam", "\"Jordan might appreciate a check-in 💜\" (no amounts, no shops)");
});
$("hold-emergency").addEventListener("click", () => {
  if (!activeHold) return;
  const hold = activeHold;
  removeHold(hold.id);
  closeHold();
  recordSpend(hold.shop, hold.amount, demoNow(), { flagged: true });
  toast("🚨 Released", `${money(hold.amount)} at ${hold.shop} went through. This is logged.`);
});

// ---------- Nudge: "Still want it?" ----------
// Softer than a hold: no waiting. One tap and it goes through, so the user stays in charge,
// but they stop for a second first. Cancelling counts as money kept.
let activeNudge = null;

function showNudge(tx, reason) {
  activeNudge = tx;
  $("nudge-shop").textContent = tx.shop;
  $("nudge-amount").textContent = money(tx.amount);
  $("nudge-reason").textContent = reason || "";
  $("nudge-overlay").hidden = false;
  $("nudge-buy").focus();
}

function closeNudge(outcome) {
  const tx = activeNudge;
  $("nudge-overlay").hidden = true;
  activeNudge = null;
  if (!tx) return;
  if (outcome === "cancel") {
    kept += tx.amount;
    save("pact.kept", kept);
    render();
    toast("❌ Cancelled", `${money(tx.amount)} kept by changing your mind.`);
  } else {
    recordSpend(tx.shop, tx.amount, tx.date, { flagged: true });
    toast(`✅ ${tx.shop} ${money(tx.amount)}: bought`, "Your choice. Your pact just checked in.");
  }
  document.dispatchEvent(new CustomEvent("pact:nudge-done", { detail: { tx, outcome } }));
}

$("nudge-buy").addEventListener("click", () => closeNudge("buy"));
$("nudge-cancel").addEventListener("click", () => closeNudge("cancel"));
