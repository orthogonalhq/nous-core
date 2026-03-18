export const onDeactivate = (input: {
  session_id: string;
  connector_id: string;
  reason: string;
}) => ({
  session_id: input.session_id,
  connector_id: input.connector_id,
  status: 'stopped',
  reason: input.reason,
});
