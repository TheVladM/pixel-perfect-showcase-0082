import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FieldDef = {
  id: string;
  label: string;
  field_type: string;
  options: unknown;
  required: boolean;
};

export function CustomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (field.field_type === "select") {
    const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
        <SelectTrigger className="h-12 text-base">
          <SelectValue placeholder="Choisir…" />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const type =
    field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "phone" ? "tel" : "text";
  const inputMode =
    field.field_type === "number" ? "decimal" : field.field_type === "phone" ? "tel" : undefined;
  return (
    <Input
      type={type}
      inputMode={inputMode}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 text-base"
    />
  );
}
