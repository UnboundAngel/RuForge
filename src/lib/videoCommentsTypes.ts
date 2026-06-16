export type VideoComment = {
  id: string;
  user: string;
  avatar: string;
  likes: number;
  text: string;
  time: string;
  timestamp?: number;
  replies: VideoComment[];
};

export type CommentsSidecarCommentRaw = {
  id: string;
  text: string;
  author: string;
  author_id?: string;
  author_thumbnail?: string;
  author_is_uploader?: boolean;
  author_is_verified?: boolean;
  like_count?: number;
  is_pinned?: boolean;
  parent?: string;
  timestamp?: number;
  _time_text?: string;
};

export type CommentsSidecarV1 = {
  v: number;
  video_id: string;
  comment_count: number;
  fetched_at: string;
  comments: CommentsSidecarCommentRaw[];
};
