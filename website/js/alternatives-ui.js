// Pact — screen code for Person 3's recommendation demo.
// The reusable recommendation function lives in alternatives.js.
// Keep DOM helpers private to avoid colliding with teammates' functions.
(() => {
  const form = document.getElementById("alternatives-profile");
  if (!form) return;
  const city = document.getElementById("alternatives-city");
  const budget = document.getElementById("alternatives-budget");
  const status = document.getElementById("alternatives-status");
  const summary = document.getElementById("alternatives-summary");
  const categoryImages = {
    "Free activity": "free-activity.svg",
    "Affordable activity": "affordable-activity.svg",
    Job: "job.svg",
    Training: "training.svg",
  };

  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function card(opportunity) {
    const item = document.createElement("li");
    item.className = "card alternatives-card";
    const imageName = categoryImages[opportunity.category];
    if (imageName) {
      const image = document.createElement("img");
      image.src = `images/alternatives/${imageName}`;
      image.alt = ""; // Decorative: the category and title below describe the card.
      image.className = "alternatives-image";
      image.width = 640;
      image.height = 240;
      item.append(image);
    }
    const cost = opportunity.cost === 0 ? "Free (£0)" : money(opportunity.cost);
    const reasons = document.createElement("ul");
    reasons.className = "alternatives-reasons";
    reasons.append(...opportunity.reasons.map(reason => element("li", reason)));
    item.append(
      element("p", opportunity.notice, "alternatives-notice"),
      element("h3", opportunity.title),
      element("p", `${opportunity.category} · ${opportunity.city} · Cost: ${cost}`),
      element("p", opportunity.description),
      element("h4", "Why this suggestion?"),
      reasons
    );
    return item;
  }

  function renderSection(name, opportunities) {
    document.getElementById(`alternatives-${name}`).replaceChildren(...opportunities.map(card));
    document.getElementById(`alternatives-${name}-empty`).hidden = opportunities.length > 0;
  }

  function update() {
    const valid = budget.value.trim() !== "" && budget.validity.valid;
    const result = recommendOpportunities({
      city: city.value,
      budget: valid ? Number(budget.value) : NaN,
      status: status.value,
      interests: [...form.querySelectorAll('input[name="interests"]:checked')].map(input => input.value),
    });
    budget.setAttribute("aria-invalid", String(!valid));
    renderSection("today", result.feelBetterToday);
    renderSection("future", result.buildMyFuture);
    summary.textContent = valid
      ? `${result.feelBetterToday.length} activities and ${result.buildMyFuture.length} future opportunities for ${city.value}.`
      : "Enter an activity budget of £0 or more, using up to two decimal places.";
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", event => { event.preventDefault(); update(); });
  update();
})();
