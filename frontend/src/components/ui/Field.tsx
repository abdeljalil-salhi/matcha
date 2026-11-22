import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

const NATIVE_CONTROLS = ["input", "select", "textarea"];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isNative(element: ReactElement<Record<string, unknown>>): boolean {
  return typeof element.type === "string" && NATIVE_CONTROLS.includes(element.type);
}

function findFirstElement(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of Children.toArray(node)) {
      const found = findFirstElement(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  return node as ReactElement<Record<string, unknown>>;
}

function findNative(
  node: ReactNode,
  preferredId?: string,
): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (isNative(element) && (!preferredId || element.props.id === preferredId)) return element;

  const props = element.props as Record<string, unknown>;
  if (!props.children) return null;
  for (const child of Children.toArray(props.children as ReactNode)) {
    const found = findNative(child, preferredId);
    if (found) return found;
  }
  return null;
}

export function Field({ label, htmlFor, hint, error, required, children, className = "" }: FieldProps) {
  const firstElement = findFirstElement(children);
  const directNative = firstElement && isNative(firstElement) ? firstElement : null;
  const nestedNative = htmlFor ? findNative(children, htmlFor) ?? findNative(children) : null;
  const target = directNative ?? nestedNative;
  const controlId = htmlFor ?? (target?.props.id as string | undefined) ?? slug(label);
  const labelId = `${controlId}-label`;
  const describedBy = [
    hint ? `${controlId}-hint` : null,
    error ? `${controlId}-error` : null,
  ].filter(Boolean).join(" ") || undefined;
  const labelTarget = target ? controlId : undefined;

  const nextProps: Record<string, unknown> = {};
  if (target) {
    nextProps.id = target.props.id ?? controlId;
    if (describedBy) {
      nextProps["aria-describedby"] = [target.props["aria-describedby"], describedBy]
        .filter(Boolean)
        .join(" ");
    }
    nextProps["aria-invalid"] = error ? true : undefined;
    if (required) nextProps["aria-required"] = true;
  } else if (firstElement) {
    nextProps["aria-labelledby"] = labelId;
    nextProps["role"] = "group";
  }

  const targetId = target?.props.id as string | undefined;
  let enhancedTarget = false;
  const enhance = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) return Children.toArray(node).map(enhance);
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    const isTarget = !enhancedTarget && target != null && (
      element === target ||
      (isNative(element) && (targetId ? element.props.id === targetId : element.props.id == null))
    );
    if (isTarget) {
      enhancedTarget = true;
      return cloneElement(element, nextProps);
    }
    const props = element.props as Record<string, unknown>;
    if (!props.children) return node;
    return cloneElement(element, {
      ...props,
      children: Children.map(props.children as ReactNode, enhance),
    });
  };

  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`.trim()}>
      <label className="field__label" id={labelId} htmlFor={labelTarget}>
        {label}
        {required ? (
          <>
            <span className="field__required" aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      {enhance(children)}
      {error ? (
        <p className="field__error" id={`${controlId}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="field__hint" id={`${controlId}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}
