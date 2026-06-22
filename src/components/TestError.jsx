import React from "react";
export default function TestError() {
  throw new Error("💥 this is a test error");
  return <div>This will never render</div>;
}
