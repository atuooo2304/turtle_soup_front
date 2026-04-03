export interface Puzzle {
  id: string;
  title: string;
  description: string;
  surface: string;
  base: string;
  difficulty: '清汤' | '红汤' | '黑汤';
  type: '本格' | '变格' | '悬疑';
  caseNumber: string;
}

export const puzzles: Puzzle[] = [
  {
    id: '1',
    title: '不存在的闹钟',
    description: '男人每天早上六点都会准时醒来，但他家里从来没有任何报时装置。直到有一天，他提前五分钟醒了过来...',
    surface: '男人每天早上六点都会准时醒来，但他家里从来没有任何报时装置。直到有一天，他提前五分钟醒了过来。为什么？',
    base: '男人是一名盲人，他依靠收音机的定时广播来起床。那天收音机坏了，他因为生物钟提前醒了。',
    difficulty: '红汤',
    type: '本格',
    caseNumber: '0812'
  },
  {
    id: '2',
    title: '深井中的镜子',
    description: '老宅的深井里倒映出的不是天空，而是另一个人的房间。今天，那个人正透过井口向下看。',
    surface: '老宅的深井里倒映出的不是天空，而是另一个人的房间。今天，那个人正透过井口向下看。这是怎么回事？',
    base: '这口井其实是一个垂直的秘密通道，底部装有潜望镜。井口上方其实是另一个房间的观察窗。',
    difficulty: '黑汤',
    type: '变格',
    caseNumber: '0815'
  },
  {
    id: '3',
    title: '雨天的乘客',
    description: '出租车司机搭载了一位浑身湿透的乘客。下车后，后座是干的，但司机的口袋里多了一枚湿漉漉的硬币。',
    surface: '出租车司机搭载了一位浑身湿透的乘客。下车后，后座是干的，但司机的口袋里多了一枚湿漉漉的硬币。为什么？',
    base: '乘客其实是一个鬼魂，他并没有实体，所以没弄湿座位。硬币是他从冥界带来的，所以是湿的。',
    difficulty: '清汤',
    type: '悬疑',
    caseNumber: '0928'
  }
];
