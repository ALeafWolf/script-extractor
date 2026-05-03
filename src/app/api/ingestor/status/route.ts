import { NextResponse } from "next/server";
import { getDbStatusLive } from "@/db/status";

export async function GET() {
  return NextResponse.json(await getDbStatusLive());
}
