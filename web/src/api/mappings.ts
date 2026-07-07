import { apiClient, pluginPath } from "./client";
import type { AliasMapping, ClassifyRule, CredentialDescriptor, ClassifyPreviewResponse } from "../types";

// --- Alias mapping CRUD ---

export async function fetchAliases(): Promise<AliasMapping[]> {
  const c = apiClient();
  const { data } = await c.get<{ aliases: AliasMapping[] }>(pluginPath("/aliases"));
  return data.aliases ?? [];
}

export async function upsertAlias(alias: AliasMapping): Promise<AliasMapping> {
  const c = apiClient();
  const { data } = await c.post<{ alias: AliasMapping }>(pluginPath("/aliases"), alias);
  return data.alias;
}

export async function deleteAlias(aliasName: string): Promise<void> {
  const c = apiClient();
  await c.delete(pluginPath("/aliases"), { data: { alias: aliasName } });
}

// --- Classification rule CRUD ---

export async function fetchClassifyRules(): Promise<ClassifyRule[]> {
  const c = apiClient();
  const { data } = await c.get<{ rules: ClassifyRule[] }>(pluginPath("/classify-rules"));
  return data.rules ?? [];
}

export async function upsertClassifyRule(rule: ClassifyRule): Promise<ClassifyRule> {
  const c = apiClient();
  const { data } = await c.post<{ rule: ClassifyRule }>(pluginPath("/classify-rules"), rule);
  return data.rule;
}

export async function deleteClassifyRule(name: string): Promise<void> {
  const c = apiClient();
  await c.delete(pluginPath("/classify-rules"), { data: { name } });
}

export async function reorderClassifyRules(names: string[]): Promise<void> {
  const c = apiClient();
  await c.post(pluginPath("/classify-rules/reorder"), { names });
}

// --- Classify preview ---

export async function classifyPreview(
  descriptors: CredentialDescriptor[],
  rules?: ClassifyRule[],
): Promise<ClassifyPreviewResponse> {
  const c = apiClient();
  const body: Record<string, unknown> = { descriptors };
  if (rules && rules.length > 0) body.rules = rules;
  const { data } = await c.post<ClassifyPreviewResponse>(pluginPath("/classify-preview"), body);
  return data;
}
