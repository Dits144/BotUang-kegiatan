"use client";

import { activateDemoSession } from "@/app/lib/demo-data";
import { Button } from "./ui/button";
import { FlaskConical } from "lucide-react";

export function DemoButton() {
  function handleDemo() {
    activateDemoSession();
    window.location.href = "/dashboard";
  }

  return (
    <Button
      variant="outline"
      className="w-full sm:w-auto"
      onClick={handleDemo}
    >
      <FlaskConical className="h-4 w-4" />
      Coba Demo Gratis
    </Button>
  );
}
