import PocketBase from "pocketbase";

// Configure VITE_POCKETBASE_URL in Vercel once the PocketBase server is online.
// Never put server/admin credentials in VITE_ environment variables.
const url = import.meta.env.VITE_POCKETBASE_URL || "https://data.musiccoach.cc.cd";
export const pb = new PocketBase(url);
pb.autoCancellation(false);