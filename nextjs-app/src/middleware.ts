import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

export default function middleware(request: NextRequest) {
  // Force HTTPS redirect in production
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto")
    const host = request.headers.get("host")
    const url = request.url
    
    // Check multiple ways to detect HTTP
    const isHttp = 
      proto === "http" ||
      (proto !== "https" && url.startsWith("http://")) ||
      (host && !request.url.includes("https://"))
    
    if (isHttp) {
      const httpsUrl = new URL(request.url)
      httpsUrl.protocol = "https:"
      return NextResponse.redirect(httpsUrl, 301)
    }
  }

  // Run auth middleware
  return auth(request as any)
}
