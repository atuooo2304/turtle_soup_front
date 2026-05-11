export type DbSubmission = {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  tag: string;
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
    type: row.tag?.trim() || '轻松',
  };
}
