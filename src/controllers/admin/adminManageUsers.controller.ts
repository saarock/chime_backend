import type { NextFunction, Request, Response } from "express";
import { ApiError, ApiResponse, asyncHandler } from "../../utils/index.js";
import User from "../../models/User.model.js";
import adminService from "../../services/databaseService/admin/Admin.service.js";


// This function is responsible to fetch users
export const fetchUsers = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
        User.find().skip(skip).limit(limit).select("_id userName fullName email role active"),
        User.countDocuments()
    ]);

    console.log(users);
    console.log(totalUsers);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render("admin/dashboard", {
        title: "Admin dashboard",
        users: users,
        totalUsers,
        currentPage: page,
        totalPages,
        userId: req.userId,
        success: req.query.success,   // pass success message here
    });
});


export const makeAdmin = asyncHandler(async (req: Request, res: Response, _) => {
    const userId = req.params.userId;
    const role = await adminService.makeAdmin(userId);
    // Redirect back to dashboard with success message as query param
    res.redirect(`/admin/dashboard?success=User promoted to ${role} successfully`);
});



export const blockAndUnBlockUser = asyncHandler(async (req: Request, res: Response, _) => {
    const userId = req.params.userId;
    const active: boolean = await adminService.blockAndUnBlockUser(userId);
    res.redirect(`/admin/dashboard?success=User get ${active ? "un-lock" : "lock"} successfully`);
})