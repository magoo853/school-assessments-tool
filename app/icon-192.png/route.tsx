import { ImageResponse } from "next/og";
import { shieldSvg } from "@/components/ShieldIcon";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {shieldSvg(192, true)}
      </div>
    ),
    { width: 192, height: 192 }
  );
}
