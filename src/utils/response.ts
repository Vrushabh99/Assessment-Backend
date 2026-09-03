import { Response } from "express";

export const success = (res: Response, data: unknown, message = "Success", status = 200): void => {
  res.status(status).json({ success: true, message, data });
};
