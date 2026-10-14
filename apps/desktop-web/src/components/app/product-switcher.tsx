"use client";

import { useTransition } from "react";
import { ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveProduct } from "./actions";

type Product = { id: string; name: string };

export function ProductSwitcher({ products, activeId }: { products: Product[]; activeId: string | null }) {
  const [pending, startTransition] = useTransition();
  const active = products.find((p) => p.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
        <span className="text-muted-foreground">Product:</span>
        <span className="font-medium">{active?.name ?? "None"}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Products</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={activeId ?? ""}
            onValueChange={(value) => startTransition(() => setActiveProduct(String(value)))}
          >
            {products.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
