// Pact — invented examples for testing, not real listings or eligibility advice.
// cost is the participation/application cost in GBP, never a job's wages.
// audiences describes demo targeting only. No actual vacancies are advertised.
const PACT_DEMO_OPPORTUNITIES = [
  {
    id: "demo-manchester-football",
    title: "Friendly football session",
    description: "An example of a free, casual sports activity.",
    kind: "activity", category: "Free activity", city: "Manchester", cost: 0,
    interests: ["sport", "outdoors"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-manchester-cooking",
    title: "Budget cooking session",
    description: "An example of preparing a meal with others, with ingredients included.",
    kind: "activity", category: "Affordable activity", city: "Manchester", cost: 4,
    interests: ["food", "creativity"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-manchester-training",
    title: "Introductory digital skills course",
    description: "An example of free training to explore a new skill.",
    kind: "opportunity", category: "Training", city: "Manchester", cost: 0,
    interests: ["technology", "careers"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-manchester-job",
    title: "Student part-time cafe role",
    description: "An invented part-time job example for students. No vacancy or wages are offered.",
    kind: "opportunity", category: "Job", city: "Manchester", cost: 0,
    interests: ["food", "careers"], audiences: ["student"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-liverpool-walk",
    title: "Relaxed group walk",
    description: "An example of spending time outdoors with others at no cost.",
    kind: "activity", category: "Free activity", city: "Liverpool", cost: 0,
    interests: ["outdoors", "sport"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-liverpool-art",
    title: "Community art session",
    description: "An example of a creative activity with materials included.",
    kind: "activity", category: "Affordable activity", city: "Liverpool", cost: 6,
    interests: ["creativity"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-liverpool-training",
    title: "Career skills workshop",
    description: "An example of free training in CV writing and interview practice.",
    kind: "opportunity", category: "Training", city: "Liverpool", cost: 0,
    interests: ["careers", "technology"], audiences: ["student", "worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
  {
    id: "demo-liverpool-job",
    title: "Career-change support assistant role",
    description: "An invented job example for workers exploring a career change. No vacancy or wages are offered.",
    kind: "opportunity", category: "Job", city: "Liverpool", cost: 0,
    interests: ["careers", "technology"], audiences: ["worker"],
    isFictional: true, notice: "Fictional demo — not a real listing.",
  },
];
