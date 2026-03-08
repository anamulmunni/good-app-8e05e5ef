import { supabase } from "@/integrations/supabase/client";

// Types
export type User = {
  id: number;
  guest_id: string;
  display_name: string | null;
  balance: number;
  key_count: number;
  is_blocked: boolean;
  payment_status: string;
  payment_scheduled_at: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

export type Transaction = {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  details: string | null;
  status: string | null;
  created_at: string | null;
};

export type PoolItem = {
  id: number;
  private_key: string;
  verify_url: string;
  is_used: boolean;
  added_by: string;
  created_at: string | null;
};

export type SubmittedNumber = {
  id: number;
  phone_number: string;
  verified_count: number;
  submitted_by: string;
  payment_number: string | null;
  payment_method: string | null;
  submitted_at: string | null;
};

export type ResetHistoryItem = {
  id: number;
  phone_number: string;
  verified_count: number;
  submitted_by: string;
  payment_number: string | null;
  payment_method: string | null;
  reset_at: string | null;
};

export type Settings = {
  rewardRate: number;
  buyStatus: string;
  bonusStatus: string;
  bonusTarget: number;
  customNotice: string;
};

// Auth / User APIs
export async function loginUser(guestId: string, displayName: string): Promise<User> {
  // Try to find existing user
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("guest_id", guestId.trim())
    .single();

  if (existing) {
    if (existing.is_blocked) throw new Error("Account is blocked");
    // Update display name if provided
    if (displayName && displayName !== existing.display_name) {
      await supabase.from("users").update({ display_name: displayName }).eq("id", existing.id);
    }
    return existing;
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({ guest_id: guestId.trim(), display_name: displayName || null })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

export async function getUser(userId: number): Promise<User | null> {
  const { data } = await supabase.from("users").select("*").eq("id", userId).single();
  return data;
}

// Settings APIs
export async function getPublicSettings(): Promise<Settings> {
  const { data } = await supabase.from("settings").select("*");
  const settings: Settings = {
    rewardRate: 40,
    buyStatus: "on",
    bonusStatus: "off",
    bonusTarget: 10,
    customNotice: "",
  };
  data?.forEach((s) => {
    if (s.key === "rewardRate") settings.rewardRate = parseInt(s.value);
    if (s.key === "buyStatus") settings.buyStatus = s.value;
    if (s.key === "bonusStatus") settings.bonusStatus = s.value;
    if (s.key === "bonusTarget") settings.bonusTarget = parseInt(s.value);
    if (s.key === "customNotice") settings.customNotice = s.value;
  });
  return settings;
}

export async function updateSetting(key: string, value: string) {
  await supabase.from("settings").update({ value }).eq("key", key);
}

// Transactions
export async function getUserTransactions(userId: number): Promise<Transaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

export async function createTransaction(tx: {
  user_id: number;
  type: string;
  amount: number;
  details?: string;
  status?: string;
}) {
  await supabase.from("transactions").insert(tx);
}

// Key operations
export async function submitKey(userId: number, privateKey: string): Promise<{ newBalance: number; message: string }> {
  // Check if key is used
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("type", "earning")
    .ilike("details", `%${privateKey.substring(0, 10)}%`)
    .limit(1);

  if (existingTx && existingTx.length > 0) {
    throw new Error("This key has already been used");
  }

  // Get reward rate
  const settings = await getPublicSettings();
  const rewardRate = settings.rewardRate;

  // Get current user
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");

  // Credit user
  const newBalance = user.balance + rewardRate;
  await supabase.from("users").update({
    balance: newBalance,
    key_count: user.key_count + 1,
  }).eq("id", userId);

  // Create transaction
  await createTransaction({
    user_id: userId,
    type: "earning",
    amount: rewardRate,
    details: `Key: ${privateKey.substring(0, 10)}...`,
    status: "completed",
  });

  return { newBalance, message: `Key verified! +${rewardRate} TK added` };
}

// Withdraw
export async function requestWithdraw(userId: number, method: string, number: string, amount: number) {
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");
  if (user.balance < amount) throw new Error("Insufficient balance");
  if (amount < 50) throw new Error("Minimum withdrawal is 50 TK");

  await supabase.from("users").update({ balance: user.balance - amount }).eq("id", userId);
  await createTransaction({
    user_id: userId,
    type: "withdrawal",
    amount,
    details: `${method.toUpperCase()}: ${number}`,
    status: "pending",
  });

  return { newBalance: user.balance - amount };
}

// Pool
export async function getPoolStats(): Promise<PoolItem[]> {
  const { data } = await supabase.from("verification_pool").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function addPoolKey(privateKey: string, verifyUrl: string, addedBy: string) {
  await supabase.from("verification_pool").insert({ private_key: privateKey, verify_url: verifyUrl, added_by: addedBy });
}

export async function getReadyKey(): Promise<PoolItem | null> {
  const { data } = await supabase
    .from("verification_pool")
    .select("*")
    .eq("is_used", false)
    .limit(1)
    .single();
  return data;
}

export async function markKeyUsed(keyId: number) {
  await supabase.from("verification_pool").update({ is_used: true }).eq("id", keyId);
}

export async function deletePoolKey(keyId: number) {
  await supabase.from("verification_pool").delete().eq("id", keyId);
}

export async function deleteUsedKeys() {
  await supabase.from("verification_pool").delete().eq("is_used", true);
}

export async function deleteAllPoolKeys() {
  await supabase.from("verification_pool").delete().neq("id", 0);
}

// Admin
export async function getAllUsers(): Promise<User[]> {
  const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function toggleBlockUser(userId: number, isBlocked: boolean) {
  await supabase.from("users").update({ is_blocked: isBlocked }).eq("id", userId);
}

export async function updateUserBalance(userId: number, balance: number) {
  await supabase.from("users").update({ balance }).eq("id", userId);
}

export async function resetUserKeyCount(userId: number) {
  await supabase.from("users").update({ key_count: 0 }).eq("id", userId);
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function updateTransactionStatus(txId: number, status: string) {
  await supabase.from("transactions").update({ status }).eq("id", txId);
}

export async function updateUserPaymentStatus(userId: number, status: string) {
  await supabase.from("users").update({ payment_status: status }).eq("id", userId);
}

// Submitted numbers
export async function getSubmittedNumbers(): Promise<SubmittedNumber[]> {
  const { data } = await supabase.from("submitted_numbers").select("*").order("submitted_at", { ascending: false });
  return data || [];
}

export async function addSubmittedNumbers(numbers: string[], submittedBy: string, paymentNumber?: string, paymentMethod?: string) {
  const items = numbers.map(n => ({
    phone_number: n,
    submitted_by: submittedBy,
    payment_number: paymentNumber || null,
    payment_method: paymentMethod || null,
  }));
  await supabase.from("submitted_numbers").insert(items);
}

export async function deleteSubmittedNumber(id: number) {
  await supabase.from("submitted_numbers").delete().eq("id", id);
}

export async function clearAllSubmittedNumbers() {
  await supabase.from("submitted_numbers").delete().neq("id", 0);
}

export async function getExistingPhoneNumbers(): Promise<string[]> {
  const { data } = await supabase.from("submitted_numbers").select("phone_number");
  return data?.map(d => d.phone_number) || [];
}

// Reset history
export async function getResetHistory(): Promise<ResetHistoryItem[]> {
  const { data } = await supabase.from("reset_history").select("*").order("reset_at", { ascending: false });
  return data || [];
}

export async function addResetHistory(phoneNumber: string, verifiedCount: number, submittedBy: string, paymentNumber?: string, paymentMethod?: string) {
  await supabase.from("reset_history").insert({
    phone_number: phoneNumber,
    verified_count: verifiedCount,
    submitted_by: submittedBy,
    payment_number: paymentNumber || null,
    payment_method: paymentMethod || null,
  });
}

// Payment lists
export async function getPaymentUsers(status: string): Promise<User[]> {
  const { data } = await supabase.from("users").select("*").eq("payment_status", status);
  return data || [];
}
