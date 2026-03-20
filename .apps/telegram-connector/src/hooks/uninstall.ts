export const onUninstall = (input: {
  app_id: string;
  purged_credential_keys: string[];
}) => ({
  app_id: input.app_id,
  purged_credential_keys: [...input.purged_credential_keys],
  status: 'removed',
});
