import { NextFunction, Response } from "express"
import { db } from "../../../db/db"
import { createNewProject, isExistingProject } from "../../queries/projects"
import * as boom from "boom"
import { StatusCode } from "../../utils/status-code"
import { assignAllAdminsAsProjectMembers, addProjectMember } from "../../queries/user-project-access"
import { IGetUserAuthInfoRequest } from "../../middleware/request.model"
import { AllowedRoles } from "../../middleware/authorization-middleware"
import { logger } from "../../../logger"
import * as pgp from "pg-promise"

const pg = pgp()


export const createProjectController = async (req: IGetUserAuthInfoRequest, res: Response, next: NextFunction) => {
    const { body: { projectName, projectMembers } } = req
    const { exists } = await db.one(isExistingProject(projectName))
    if (!exists) {
        const project = await db.one(createNewProject(projectName))
        logger.info(`Granting access to all admin users to project ${projectName}`)
        await db.query(assignAllAdminsAsProjectMembers(project.id))
        // admin user(s) already added
        if (req.user.role !== AllowedRoles.Admin) {
            // add only current user if it's not admin
            logger.info(`Granting access current user ${req.user.userId} to project ${projectName}`)
            await db.query(addProjectMember(project.id, req.user.userId))
        }
        if (req.user.role === AllowedRoles.Admin && projectMembers?.length > 0) {
            const columnSet = new pg.helpers.ColumnSet([
                { name: "project_id", prop: "projectId" },
                { name: "user_id", prop: "userId" }],
                { table: new pg.helpers.TableName({ table: "user_project_access", schema: "jtl" }) })
            const dataToBeInserted = projectMembers.map(user => ({
                userId: user,
                projectId: project.id,
            }))
            logger.info(`Granting access to following users ${projectMembers}`)
            const query = pg.helpers.insert(dataToBeInserted, columnSet)
            await db.none(query)

        }
    } else {
        return next(boom.conflict("Project already exists"))
    }
    res.status(StatusCode.Created).send()
}
