import { useState } from "react";
import { getCustomerPortalUrl, updateUserProfile, useQuery } from "wasp/client/operations";
import { Link as WaspRouterLink, routes } from "wasp/client/router";
import type { User } from "wasp/entities";
import { Button } from "../client/components/ui/button";
import { Checkbox } from "../client/components/ui/checkbox";
import { Input } from "../client/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../client/components/ui/card";
import { Separator } from "../client/components/ui/separator";
import { toast } from "../client/hooks/use-toast";
import { Mail, Mic, Save, User as UserIcon, Volume2 } from "lucide-react";
import {
  PaymentPlanId,
  SubscriptionStatus,
  parsePaymentPlanId,
  prettyPaymentPlanName,
} from "../payment/plans";

function speakFeedback(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech synthesis error:", e);
    }
  }
}

export function AccountPage({ user }: { user: User }) {
  const [username, setUsername] = useState(user.username || "");
  const [email, setEmail] = useState(user.email || "");
  const [wakeWord, setWakeWord] = useState((user as any).wakeWord || "hey Jarvis");
  const [allowVoice, setAllowVoice] = useState<boolean>((user as any).allowVoice ?? true);
  const [isSaving, setIsSaving] = useState(false);

  const [savedState, setSavedState] = useState({
    username: user.username || "",
    email: user.email || "",
    wakeWord: (user as any).wakeWord || "hey Jarvis",
    allowVoice: (user as any).allowVoice ?? true,
  });

  const hasChanges =
    username !== savedState.username ||
    email !== savedState.email ||
    wakeWord !== savedState.wakeWord ||
    allowVoice !== savedState.allowVoice;

  const handleAllowVoiceToggle = async (checked: boolean) => {
    setAllowVoice(checked);
    const feedbackText = checked ? "Voice control on" : "Voice control off";
    speakFeedback(feedbackText);

    toast({
      title: feedbackText,
      description: checked
        ? "The voice assistant will now listen for your wake word in the background."
        : "Background voice wake word listening is disabled.",
    });

    try {
      await updateUserProfile({
        allowVoice: checked,
      });
      setSavedState((prev) => ({ ...prev, allowVoice: checked }));
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update voice preference.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast({
        title: "Validation Error",
        description: "Name / Username cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (!wakeWord.trim()) {
      toast({
        title: "Validation Error",
        description: "Wake word phrase cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateUserProfile({
        username: username.trim(),
        email: email.trim(),
        wakeWord: wakeWord.trim(),
        allowVoice,
      });

      setSavedState({
        username: username.trim(),
        email: email.trim(),
        wakeWord: wakeWord.trim(),
        allowVoice,
      });

      toast({
        title: "Account Updated",
        description: "Your profile details, email, and voice settings have been saved.",
      });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update account settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-10 px-6 max-w-4xl mx-auto">
      <form onSubmit={handleSubmit}>
        <Card className="mb-8 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-6">
            <div>
              <CardTitle className="text-foreground text-lg font-semibold leading-6">
                Account Profile & Settings
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm mt-1">
                Manage your personal details, email address, and voice assistant preferences.
              </CardDescription>
            </div>
            <Button
              type="submit"
              disabled={isSaving || !hasChanges}
              className="flex items-center gap-1.5 shadow-sm"
            >
              {isSaving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-0">
              {/* Allow Voice use Checkbox */}
              <div className="px-6 py-4 bg-muted/20 border-b border-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-center">
                  <div className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-500" />
                    Voice Control
                  </div>
                  <div className="sm:col-span-2 mt-1 sm:mt-0 flex items-center gap-3">
                    <Checkbox
                      id="allowVoice"
                      checked={allowVoice}
                      onCheckedChange={(checked) => handleAllowVoiceToggle(Boolean(checked))}
                      className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <label
                      htmlFor="allowVoice"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Allow Voice use
                    </label>
                    <span className="text-xs text-muted-foreground ml-2">
                      {allowVoice ? "(Active - Listening for wake word)" : "(Disabled)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* User Name / Username */}
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-center">
                  <label htmlFor="username" className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-primary" />
                    Name / Username
                  </label>
                  <div className="sm:col-span-2 mt-1 sm:mt-0 max-w-md">
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. Gary Scott"
                      className="bg-background"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Email Address */}
              <Separator />
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-center">
                  <label htmlFor="email" className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    Email address
                  </label>
                  <div className="sm:col-span-2 mt-1 sm:mt-0 max-w-md">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="bg-background"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Wake Word Setting */}
              <Separator />
              <div className="px-6 py-4 bg-muted/20">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-start">
                  <label htmlFor="wakeWord" className="text-muted-foreground text-sm font-medium flex items-center gap-2 pt-2">
                    <Mic className="w-4 h-4 text-emerald-500" />
                    Wake Word
                  </label>
                  <div className="sm:col-span-2 mt-1 sm:mt-0 max-w-md flex flex-col gap-2">
                    <Input
                      id="wakeWord"
                      type="text"
                      value={wakeWord}
                      onChange={(e) => setWakeWord(e.target.value)}
                      placeholder="e.g. hey Jarvis"
                      className="bg-background"
                      required
                    />
                    <p className="text-muted-foreground text-xs">
                      Speak this phrase to wake up your voice assistant locally (e.g. <span className="font-semibold text-foreground">"hey Jarvis"</span>).
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan Info */}
              <Separator />
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-center">
                  <div className="text-muted-foreground text-sm font-medium">
                    Your Plan
                  </div>
                  <UserCurrentSubscriptionPlan
                    subscriptionPlan={user.subscriptionPlan}
                    subscriptionStatus={user.subscriptionStatus}
                    datePaid={user.datePaid}
                  />
                </div>
              </div>

              {/* Credits */}
              <Separator />
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4 items-center">
                  <div className="text-muted-foreground text-sm font-medium">
                    Credits
                  </div>
                  <div className="text-foreground mt-1 text-sm sm:col-span-1 sm:mt-0">
                    {user.credits} credits
                  </div>
                  <div className="ml-auto mt-4 sm:mt-0">
                    <BuyMoreButton subscriptionStatus={user.subscriptionStatus} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function UserCurrentSubscriptionPlan({
  subscriptionPlan,
  subscriptionStatus,
  datePaid,
}: Pick<User, "subscriptionPlan" | "subscriptionStatus" | "datePaid">) {
  let subscriptionPlanMessage = "Free Plan";
  if (
    subscriptionPlan !== null &&
    subscriptionStatus !== null &&
    datePaid !== null
  ) {
    subscriptionPlanMessage = formatSubscriptionStatusMessage(
      parsePaymentPlanId(subscriptionPlan),
      datePaid,
      subscriptionStatus as SubscriptionStatus,
    );
  }

  return (
    <>
      <div className="text-foreground mt-1 text-sm sm:col-span-1 sm:mt-0">
        {subscriptionPlanMessage}
      </div>
      <div className="ml-auto mt-4 sm:mt-0">
        <CustomerPortalButton />
      </div>
    </>
  );
}

function formatSubscriptionStatusMessage(
  subscriptionPlan: PaymentPlanId,
  datePaid: Date,
  subscriptionStatus: SubscriptionStatus,
): string {
  const paymentPlanName = prettyPaymentPlanName(subscriptionPlan);
  const statusToMessage: Record<SubscriptionStatus, string> = {
    active: `${paymentPlanName}`,
    past_due: `Payment for your ${paymentPlanName} plan is past due! Please update your subscription payment information.`,
    cancel_at_period_end: `Your ${paymentPlanName} plan subscription has been canceled, but remains active until the end of the current billing period: ${prettyPrintEndOfBillingPeriod(
      datePaid,
    )}`,
    deleted: `Your previous subscription has been canceled and is no longer active.`,
  };

  if (!statusToMessage[subscriptionStatus]) {
    throw new Error(`Invalid subscription status: ${subscriptionStatus}`);
  }

  return statusToMessage[subscriptionStatus];
}

function prettyPrintEndOfBillingPeriod(datePaid: Date) {
  const lastDayOfNextMonth = new Date(datePaid);
  lastDayOfNextMonth.setMonth(lastDayOfNextMonth.getMonth() + 2, 0);
  // Clamped so e.g., Jan 31 + 1 month → Feb 28, not until March 3.
  const clampedDayOfMonth = Math.min(
    datePaid.getDate(),
    lastDayOfNextMonth.getDate(),
  );
  const endOfBillingPeriod = new Date(datePaid);
  endOfBillingPeriod.setMonth(
    endOfBillingPeriod.getMonth() + 1,
    clampedDayOfMonth,
  );
  return endOfBillingPeriod.toLocaleDateString();
}

function CustomerPortalButton() {
  const { data: customerPortalUrl, isLoading: isCustomerPortalUrlLoading } =
    useQuery(getCustomerPortalUrl);

  if (!customerPortalUrl) {
    return null;
  }

  return (
    <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
      <Button disabled={isCustomerPortalUrlLoading} variant="link">
        Manage Payment Details
      </Button>
    </a>
  );
}

function BuyMoreButton({
  subscriptionStatus,
}: Pick<User, "subscriptionStatus">) {
  if (
    subscriptionStatus === SubscriptionStatus.Active ||
    subscriptionStatus === SubscriptionStatus.CancelAtPeriodEnd
  ) {
    return null;
  }

  return (
    <WaspRouterLink
      to={routes.PricingPageRoute.to}
      className="text-primary hover:text-primary/80 text-sm font-medium transition-colors duration-200"
    >
      <Button variant="link">Buy More Credits</Button>
    </WaspRouterLink>
  );
}
