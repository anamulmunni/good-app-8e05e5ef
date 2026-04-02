import { supabase } from "@/integrations/supabase/client";

// Types
export type User = {
  id: number;
  guest_id: string;
  display_name: string | null;
  is_verified_badge: boolean;
  balance: number;
  key_count: number;
  is_blocked: boolean;
  payment_status: string;
  payment_scheduled_at: string | null;
  created_at: string | null;
  avatar_url: string | null;
  watched_video_url: string | null;
  email: string | null;
  auth_id: string | null;
  online_at?: string | null;
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
  videoUrl: string;
  requestSubmitPassword: string;
  minRequestVerified: number;
  minRequestTarget: number;
  paymentMode: string;
  minWithdraw: number;
  withdrawLockUntil: string | null;
  requestLockUntil: string | null;
  appVersion: number;
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
  const { data, error } = await supabase.from("settings").select("*");
  if (error) throw error;

  const settings: Settings = {
    rewardRate: 40,
    buyStatus: "on",
    bonusStatus: "off",
    bonusTarget: 10,
    customNotice: "",
    videoUrl: "",
    requestSubmitPassword: "Anamul-341321",
    minRequestVerified: 10,
    minRequestTarget: 0,
    paymentMode: "off",
    minWithdraw: 50,
    withdrawLockUntil: null,
    requestLockUntil: null,
    appVersion: 0,
  };

  data?.forEach((s) => {
    if (s.key === "rewardRate") settings.rewardRate = parseInt(s.value) || settings.rewardRate;
    if (s.key === "buyStatus") settings.buyStatus = s.value;
    if (s.key === "bonusStatus") settings.bonusStatus = s.value;
    if (s.key === "bonusTarget") settings.bonusTarget = parseInt(s.value) || settings.bonusTarget;
    if (s.key === "customNotice") settings.customNotice = s.value;
    if (s.key === "videoUrl") settings.videoUrl = s.value;
    if (s.key === "requestSubmitPassword") settings.requestSubmitPassword = s.value;
    if (s.key === "minRequestVerified") settings.minRequestVerified = parseInt(s.value) || 10;
    if (s.key === "minRequestTarget") settings.minRequestTarget = parseInt(s.value) || 0;
    if (s.key === "paymentMode") settings.paymentMode = s.value;
    if (s.key === "minWithdraw") settings.minWithdraw = parseInt(s.value) || 50;
    if (s.key === "withdrawLockUntil") settings.withdrawLockUntil = s.value || null;
    if (s.key === "requestLockUntil") settings.requestLockUntil = s.value || null;
    if (s.key === "appVersion") settings.appVersion = parseInt(s.value) || 0;
  });

  return settings;
}

export async function updateSetting(key: string, value: string) {
  const { data: existingRows, error: existingError } = await supabase
    .from("settings")
    .select("id")
    .eq("key", key)
    .limit(1);

  if (existingError) throw existingError;

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase.from("settings").update({ value }).eq("key", key);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("settings").insert({ key, value });
  if (error) throw error;
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
  // Use longer prefix (20 chars) for more accurate duplicate detection
  const keyPrefix = privateKey.substring(0, 20);
  
  // Check if this exact key was already submitted by ANY user
  // Use exact prefix match to avoid false positives from substring matching
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id, user_id")
    .eq("type", "earning")
    .like("details", `Key: ${keyPrefix}%`)
    .limit(1);

  if (existingTx && existingTx.length > 0) {
    // Log duplicate attempt for admin detection
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "duplicate_attempt",
      amount: 0,
      details: `Duplicate Key: ${privateKey}`,
      status: "blocked",
    });
    throw new Error("This key has already been used");
  }

  // Get reward rate
  const settings = await getPublicSettings();
  const rewardRate = settings.rewardRate;

  // Get current user
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");

  // Increment key count and add balance if paymentMode is on
  const newKeyCount = user.key_count + 1;
  const isPaymentOn = settings.paymentMode === "on";
  const earnedAmount = isPaymentOn ? rewardRate : 0;
  const newBalance = user.balance + earnedAmount;
  
  await supabase.from("users").update({
    key_count: newKeyCount,
    balance: newBalance,
  }).eq("id", userId);

  // Create transaction record with full key for admin visibility
  await createTransaction({
    user_id: userId,
    type: "earning",
    amount: earnedAmount,
    details: `Key: ${keyPrefix}...`,
    status: "completed",
  });

  return { newBalance, message: isPaymentOn ? `Verified! +${rewardRate} TK` : `Verified! Total count: ${newKeyCount}` };
}

// Withdraw
export async function requestWithdraw(userId: number, method: string, number: string, amount: number) {
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");
  if (user.balance < amount) throw new Error("Insufficient balance");
  const settings = await getPublicSettings();
  const minW = settings.minWithdraw || 50;
  if (amount < minW) throw new Error(`সর্বনিম্ন উইথড্র ${minW} TK`);

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
  // Fetch all keys (bypass 1000 row default limit)
  let allData: PoolItem[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("verification_pool")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
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

export async function updateUserVerifiedBadge(userId: number, isVerifiedBadge: boolean) {
  await supabase.from("users").update({ is_verified_badge: isVerifiedBadge }).eq("id", userId);
}

export async function updateUserBalance(userId: number, balance: number) {
  await supabase.from("users").update({ balance }).eq("id", userId);
}

export async function resetUserKeyCount(userId: number) {
  await supabase.from("users").update({ key_count: 0 }).eq("id", userId);
}

export async function updateUserKeyCount(userId: number, keyCount: number) {
  const { error } = await supabase.from("users").update({ key_count: keyCount }).eq("id", userId);
  if (error) throw error;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function updateTransactionStatus(txId: number, status: string) {
  // Get the transaction first
  const { data: tx } = await supabase.from("transactions").select("*").eq("id", txId).single();
  if (!tx) throw new Error("Transaction not found");

  await supabase.from("transactions").update({ status }).eq("id", txId);

  if (tx.type === "withdrawal") {
    if (status === "rejected") {
      // Refund: add the amount back to user's balance
      const user = await getUser(tx.user_id);
      if (user) {
        await supabase.from("users").update({ balance: user.balance + tx.amount }).eq("id", tx.user_id);
      }
    } else if (status === "completed") {
      // Approved: reset key_count to 0
      await supabase.from("users").update({ key_count: 0 }).eq("id", tx.user_id);
    }
  }
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

// Update user watched video URL
export async function updateUserWatchedVideo(userId: number, videoUrl: string) {
  await supabase.from("users").update({ watched_video_url: videoUrl }).eq("id", userId);
}

// Get duplicate key attempts
export async function getDuplicateKeyAttempts(): Promise<{
  user_id: number;
  guest_id: string;
  display_name: string | null;
  details: string;
  created_at: string | null;
}[]> {
  const { data: attempts } = await supabase
    .from("transactions")
    .select("user_id, details, created_at")
    .eq("type", "duplicate_attempt")
    .order("created_at", { ascending: false });

  if (!attempts || attempts.length === 0) return [];

  // Get user info for each
  const userIds = [...new Set(attempts.map(a => a.user_id))];
  const { data: usersData } = await supabase
    .from("users")
    .select("id, guest_id, display_name")
    .in("id", userIds);

  const userMap = new Map(usersData?.map(u => [u.id, u]) || []);
  
  return attempts.map(a => ({
    user_id: a.user_id,
    guest_id: userMap.get(a.user_id)?.guest_id || "Unknown",
    display_name: userMap.get(a.user_id)?.display_name || null,
    details: a.details || "",
    created_at: a.created_at,
  }));
}

// Recalculate all users' balance based on key_count * rate (uses DB function for speed)
export async function recalculateAllBalances(rate: number) {
  const { error } = await supabase.rpc("recalculate_all_balances", { p_rate: rate });
  if (error) throw error;
}

// Reset all users' balance to 0 when paymentMode is turned off
export async function resetAllBalances() {
  await supabase.from("users").update({ balance: 0 }).gt("id", 0);
}
