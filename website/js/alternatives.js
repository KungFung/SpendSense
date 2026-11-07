// Pact — recommendation logic, independent of the screen and browser storage.
// Teammates can call:
// recommendOpportunities({ city: "Manchester", budget: 0,
//   status: "student", interests: ["careers"] });
// Returns { feelBetterToday: [...], buildMyFuture: [...] }.
// Each result is a record with an additional reasons array for display.
// Empty interests means all interests; otherwise at least one tag must match.
// Budget applies ONLY to activities. Status must be student or worker.
// An optional purchaseContext field may be passed later; it is not used yet.
function recommendOpportunities(profile = {}, opportunities = PACT_DEMO_OPPORTUNITIES) {
  const result = { feelBetterToday: [], buildMyFuture: [] };
  const city = String(profile.city ?? "").trim().toLowerCase();
  const status = String(profile.status ?? "").trim().toLowerCase();
  const budget = typeof profile.budget === "number" || typeof profile.budget === "string"
    ? Number(profile.budget) : NaN;
  if (!city || !["student", "worker"].includes(status) ||
      !Number.isFinite(budget) || budget < 0 || String(profile.budget).trim() === "") {
    return result;
  }
  const interests = Array.isArray(profile.interests)
    ? profile.interests.filter((tag) => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    : [];

  for (const opportunity of opportunities) {
    if (opportunity.city.toLowerCase() !== city || !opportunity.audiences.includes(status)) continue;
    if (opportunity.kind === "activity" && opportunity.cost > budget) continue;
    const matchedInterests = opportunity.interests.filter((tag) => interests.includes(tag));
    if (interests.length && !matchedInterests.length) continue;

    const reasons = [
      `In your selected city: ${opportunity.city}.`,
      `Included for your ${status} profile in this demo.`,
    ];
    if (opportunity.kind === "activity") {
      reasons.push(opportunity.cost === 0 ? "Free activity." : `Within your £${budget} activity budget.`);
    } else {
      reasons.push("Activity budget does not limit jobs or training.");
    }
    reasons.push(matchedInterests.length
      ? `Matches your interests: ${matchedInterests.join(", ")}.`
      : "You are exploring all interests.");
    const section = opportunity.kind === "activity" ? "feelBetterToday" : "buildMyFuture";
    result[section].push({ ...opportunity, reasons });
  }
  return result;
}
