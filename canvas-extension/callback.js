const params = new URLSearchParams(window.location.search);
const state = params.get("state");

console.log("🎉 Callback received!");
console.log("State:", state);