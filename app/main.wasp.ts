import { api, app, page, route } from "@wasp.sh/spec";
import { head } from "./src/client/head.wasp";
import { authConfig, authSpec } from "./src/auth/auth.wasp";
import { emailSender } from "./src/server/emailSender.wasp";
import { userSpec } from "./src/user/user.wasp";
import { adminSpec } from "./src/admin/admin.wasp";
import { analyticsSpec } from "./src/analytics/analytics.wasp";
import { demoAiAppSpec } from "./src/demo-ai-app/demo-ai-app.wasp";
import { fileUploadSpec } from "./src/file-upload/file-upload.wasp";
import { paymentSpec } from "./src/payment/payment.wasp";

import { LandingPage } from "./src/landing-page/LandingPage" with { type: "ref" };
import { VoicePage } from "./src/client/VoicePage" with { type: "ref" };
import { getVoiceToken } from "./src/apis/voice" with { type: "ref" };
import { getVoiceMessages, saveVoiceMessage, getWakeWord, updateWakeWord } from "./src/apis/voiceMessages" with { type: "ref" };
import { App } from "./src/client/App" with { type: "ref" };
import { serverEnvValidationSchema } from "./src/env" with { type: "ref" };

export default app({
  name: "OpenSaaS",
  title: "OpenSaaS App",
  wasp: {
    version: "^0.25.0",
  },
  head,
  auth: authConfig,
  client: {
    rootComponent: App,
  },
  server: {
    envValidationSchema: serverEnvValidationSchema,
  },
  emailSender,
  spec: [
    // Register the landing page and voice routes
    route("LandingPageRoute", "/", page(LandingPage)),
    route("VoiceRoute", "/voice", page(VoicePage)),

    // Register custom voice token endpoint
    api("GET", "/api/voice/token", getVoiceToken),
    api("GET", "/api/voice/messages", getVoiceMessages, { entities: ["VoiceMessage", "User"] }),
    api("POST", "/api/voice/messages", saveVoiceMessage, { entities: ["VoiceMessage", "User"] }),
    api("GET", "/api/voice/wakeword", getWakeWord, { entities: ["User"] }),
    api("POST", "/api/voice/wakeword", updateWakeWord, { entities: ["User"] }),

    // Include sub-specs
    authSpec,
    userSpec,
    adminSpec,
    analyticsSpec,
    demoAiAppSpec,
    fileUploadSpec,
    paymentSpec,
  ],
});
