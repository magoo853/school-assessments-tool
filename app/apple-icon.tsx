import { ImageResponse } from "next/og";
import { shieldSvg } from "@/components/ShieldIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // Full-bleed: iOS applies its own corner rounding.
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {shieldSvg(180, false)}
      </div>
    ),
    { ...size }
  );
}
