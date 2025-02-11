import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vault_depositor_records } from "@/db/schema";

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;

  const depositorAuthority = searchParams.get("depositorAuthority");
  const vault = searchParams.get("vault");

  if (!depositorAuthority) {
    return NextResponse.json({
      error: "depositorAuthority is required in the query params",
    });
  }

  if (!vault) {
    return NextResponse.json({
      error: "vault is required in the query params",
    });
  }

  const vaultSnapshots = await db
    .select()
    .from(vault_depositor_records)
    .where(
      and(
        eq(vault_depositor_records.depositorAuthority, depositorAuthority),
        eq(vault_depositor_records.vault, vault),
      ),
    )
    .orderBy(asc(vault_depositor_records.slot));

  return NextResponse.json(vaultSnapshots, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
};
