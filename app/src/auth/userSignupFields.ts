import { defineUserSignupFields } from 'wasp/server/auth';

const adminEmails: string[] = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

export const userSignupFields = defineUserSignupFields({
  isAdmin: (data: any) => {
    const email = data?.profile?.email;
    return !!email && adminEmails.includes(email);
  },
});

export const getEmailUserFields = userSignupFields;
