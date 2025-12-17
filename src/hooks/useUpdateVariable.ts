import { useFigmaTokenContext } from "contexts/useFigmaTokenContext";
import { useMutation } from "hooks/useMutation";
import type { UpdateVariablePayload } from "types/mutations";
import { FIGMA_VARIABLE_BY_ID_ENDPOINT, ERROR_MSG_TOKEN_REQUIRED } from "constants/index";
import { mutator } from "api/mutator";

/**
 * React hook that updates an existing Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * The hook returns a `mutate` function to trigger the update with given payload and exposes state flags.
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figma-vars/hooks';
 *
 * function UpdateVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, error } = useUpdateVariable();
 *
 *   const onUpdate = () => mutate({ variableId: id, payload: { name: 'new-name' } });
 *
 *   if (isLoading) return <div>Updating...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <button onClick={onUpdate}>Update Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useUpdateVariable = () => {
  const { token } = useFigmaTokenContext();
  const mutation = useMutation(
    async ({ variableId, payload }: { variableId: string; payload: UpdateVariablePayload }) => {
      if (!token) {
        throw new Error(ERROR_MSG_TOKEN_REQUIRED);
      }
      return await mutator(
        FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId),
        token,
        "UPDATE",
        payload as unknown as Record<string, unknown>,
      );
    },
  );
  return mutation;
};
