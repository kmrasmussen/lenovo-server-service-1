import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

export default function middleware(request: NextRequest) {
  // Force HTTPS redirect in production
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") !== "https"
  ) {
    const httpsUrl = new URL(request.url)
    httpsUrl.protocol = "https:"
    return NextResponse.redirect(httpsUrl)
  }

  // Run auth middleware
  return auth(request as any)
}
