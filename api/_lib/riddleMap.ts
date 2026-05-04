/** 与前端 Riddle.type（汤氛围）对齐 */
export function soupTypeToRiddleType(soupType: string): string {
  const m: Record<string, string> = {
    清汤: '轻松',
    红汤: '恐怖',
    黑汤: '悬疑',
  };
  return m[soupType] ?? '轻松';
}

export type DbSubmission = {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  soup_type: string;
  difficulty: string;
  status: string;
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export function dbRowToRiddle(row: DbSubmission): {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  difficulty: string;
  type: string;
} {
  return {
    id: row.id,
    title: row.title,
    surface: row.surface,
    bottom: row.bottom,
    difficulty: (row.difficulty || 'medium').toLowerCase(),
    type: soupTypeToRiddleType(row.soup_type),
  };
}
