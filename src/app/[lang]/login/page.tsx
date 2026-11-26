import { Suspense } from "react";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <Suspense>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}
