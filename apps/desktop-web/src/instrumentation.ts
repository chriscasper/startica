// Called once when the Next.js server starts, before it serves requests.
export async function register() {
  // Not during `next build`: the build must never open the user's database.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { start } = await import("./lib/startup");
    await start();
  }
}
