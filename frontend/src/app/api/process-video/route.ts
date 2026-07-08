import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { BACKEND_API_URL } from "@/lib/backend-url";
import { sanitizeErrorMessage } from "@/lib/safe-error";

function getErrorMessage(error: unknown): string {
  return sanitizeErrorMessage(error, "Internal Server Error");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Session invalid" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Convert JSON body to FormData as backend expects
    const formData = new FormData();
    formData.append("video_url", body.video_url);
    if (body.language) formData.append("language", body.language);

    const res = await fetch(`${BACKEND_API_URL}/api/process-video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: sanitizeErrorMessage(errorText || `Backend returned status ${res.status}`) },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
