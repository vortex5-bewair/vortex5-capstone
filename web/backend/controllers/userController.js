const User = require('../models/userModel')
const EmailVerification = require('../models/emailVerificationModel')
const PasswordReset = require('../models/passwordResetModel')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const validator = require('validator')
const cloudinary = require('../utils/cloudinary')
const logAudit = require('../utils/logAudit');
const sendVerificationEmail = require('../utils/sendVerificationEmail')
const sendPasswordResetEmail = require('../utils/sendPasswordResetEmail')

const createToken = (_id) => {
   return jwt.sign({_id}, process.env.SECRET, {expiresIn: '3d'})
}

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString()

// POST /api/user/signup/send-code — email a 6-digit verification code
const sendSignupCode = async (req, res) => {
    const { email } = req.body

    if (!email || !validator.isEmail(email)) {
        return res.status(400).json({ error: 'A valid email is required' })
    }

    try {
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' })
        }

        const code = generateCode()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        await EmailVerification.findOneAndUpdate(
            { email },
            { code, expiresAt, attempts: 0 },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )

        await sendVerificationEmail(email, code)

        res.status(200).json({ message: 'Verification code sent' })
    } catch (error) {
        res.status(500).json({ error: 'Failed to send verification code' })
    }
}

// POST /api/user/forgot-password — email a 6-digit password reset code
const forgotPassword = async (req, res) => {
    const { email } = req.body

    if (!email || !validator.isEmail(email)) {
        return res.status(400).json({ error: 'A valid email is required' })
    }

    try {
        const existingUser = await User.findOne({ email })
        if (!existingUser) {
            return res.status(400).json({ error: 'No account found with that email' })
        }

        const code = generateCode()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        await PasswordReset.findOneAndUpdate(
            { email },
            { code, expiresAt, attempts: 0 },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )

        await sendPasswordResetEmail(email, code)

        res.status(200).json({ message: 'Password reset code sent' })
    } catch (error) {
        res.status(500).json({ error: 'Failed to send password reset code' })
    }
}

// POST /api/user/reset-password — verify the code and set a new password
const resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body

    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Email, code, and new password are required' })
    }
    if (!validator.isStrongPassword(newPassword)) {
        return res.status(400).json({ error: 'New password is not strong enough (need 8+ chars, mixed case, number, symbol)' })
    }

    try {
        const reset = await PasswordReset.findOne({ email })
        if (!reset || reset.expiresAt < new Date()) {
            return res.status(400).json({ error: 'Code expired or not found. Request a new one.' })
        }
        if (reset.attempts >= 5) {
            return res.status(400).json({ error: 'Too many incorrect attempts. Request a new code.' })
        }
        if (reset.code !== code) {
            reset.attempts += 1
            await reset.save()
            return res.status(400).json({ error: 'Invalid code.' })
        }

        const user = await User.findOne({ email })
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        const salt = await bcrypt.genSalt(10)
        user.password = await bcrypt.hash(newPassword, salt)
        await user.save()

        await PasswordReset.deleteOne({ email })

        await logAudit({
            module: 'User',
            action: `User ${user.firstName} ${user.lastName} (${user.email}) reset their password`,
            user: user.email
        })

        res.status(200).json({ message: 'Password reset successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

const loginUser = async (req, res) => {
    const {email, password} = req.body

    // Reject non-string email/password before they ever reach a Mongo query —
    // otherwise a body like {"email":{"$gt":""}} turns User.findOne({email})
    // into a query-operator match instead of a text comparison.
    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Invalid email or password.' })
    }

    try {
        const user = await User.login(email, password)
        const token = createToken(user._id)

        res.status(200).json({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            token
        })
    } catch (error) {
        res.status(400).json({error: error.message})
    }
}

const signupUser = async (req, res) => {
    const {email, password, firstName, lastName, teacherId, department, staffType, code} = req.body

    try {
        if (!code) {
            throw Error('Verification code is required')
        }

        const verification = await EmailVerification.findOne({ email })
        if (!verification || verification.expiresAt < new Date()) {
            throw Error('Code expired or not found. Request a new one.')
        }
        if (verification.attempts >= 5) {
            throw Error('Too many incorrect attempts. Request a new code.')
        }
        if (verification.code !== code) {
            verification.attempts += 1
            await verification.save()
            throw Error('Invalid code.')
        }
        await EmailVerification.deleteOne({ email })

        // First account in the system becomes admin automatically and is active immediately
        // (there's no one else to approve them). Everyone else signs up as staff, pending
        // admin approval — they cannot log in until approved. Public signup cannot self-elevate
        // to admin.
        const userCount = await User.countDocuments()
        const role = userCount === 0 ? 'admin' : 'staff'
        const status = userCount === 0 ? 'active' : 'pending'

        const user = await User.signup(email, password, firstName, lastName, role, { teacherId, department, staffType, status })

        logAudit({
            module: 'User',
            action: `New user registered: ${firstName} ${lastName} (${email}) as ${role} (${status})`,
            user: email
        })

        if (status !== 'active') {
            return res.status(200).json({
                message: 'Account created. An admin needs to approve your account before you can log in.'
            })
        }

        const token = createToken(user._id)

        res.status(200).json({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            token
        })
    } catch (error) {
        res.status(400).json({error: error.message})
    }
}

// Admin-only: create a new user with a chosen role.
// Different from signup — this doesn't log the new user in, doesn't return a token.
const createUserByAdmin = async (req, res) => {
    const {email, password, firstName, lastName, role} = req.body

    if (!['admin', 'staff'].includes(role)) {
        return res.status(400).json({error: 'Invalid role. Must be admin or staff.'})
    }

    try {
        const user = await User.signup(email, password, firstName, lastName, role, { status: 'active' })

        logAudit({
            module: 'User',
            action: `New ${role} created: ${firstName} ${lastName} (${email}) by ${req.user.email}`,
            user: req.user.email
        })

        res.status(200).json({
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt
        })
    } catch (error) {
        res.status(400).json({error: error.message})
    }
}

const getUsers = async (req, res) => {
    const { status } = req.query
    
    let query = {}
    if (status && ['active', 'deactivated'].includes(status)) {
        query.status = status
    }
    
    const users = await User.find(query).select('-password')
    res.status(200).json(users)
}

const deactivateUser = async (req, res) => {
    const { id } = req.params

    if (req.user._id.toString() === id) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' })
    }

    try {
        const user = await User.findByIdAndUpdate(
            id,
            {
                status: 'deactivated',
                deactivatedAt: new Date()
            },
            { new: true }
        ).select('-password')

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        await logAudit({
            module: 'User',
            action: `User ${user.firstName} ${user.lastName} (${user.email}) was deactivated`,
            user: req.user?.email || 'Unknown'
        })

        res.status(200).json({ 
            message: 'User deactivated successfully',
            user 
        })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

const reactivateUser = async (req, res) => {
    const { id } = req.params

    try {
        const user = await User.findByIdAndUpdate(
            id,
            {
                status: 'active',
                deactivatedAt: null
            },
            { new: true }
        ).select('-password')

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        await logAudit({
            module: 'User',
            action: `User ${user.firstName} ${user.lastName} (${user.email}) was reactivated`,
            user: req.user?.email || 'Unknown'
        })

        res.status(200).json({ 
            message: 'User reactivated successfully',
            user 
        })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

// Admin-only: permanently delete a user account. Unlike deactivate, this
// removes the document entirely — no other collection references User by
// ID, so no further cleanup is needed.
const deleteUser = async (req, res) => {
    const { id } = req.params

    if (req.user._id.toString() === id) {
        return res.status(400).json({ error: 'You cannot delete your own account' })
    }

    try {
        const target = await User.findById(id)
        if (!target) {
            return res.status(404).json({ error: 'User not found' })
        }

        await User.findByIdAndDelete(id)

        await logAudit({
            module: 'User',
            action: `User ${target.firstName} ${target.lastName} (${target.email}) was permanently deleted`,
            user: req.user?.email || 'Unknown'
        })

        res.status(200).json({ message: 'User deleted successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

const approveUser = async (req, res) => {
    const { id } = req.params

    try {
        const target = await User.findById(id)
        if (!target) {
            return res.status(404).json({ error: 'User not found' })
        }
        if (target.status !== 'pending') {
            return res.status(400).json({ error: 'User is not pending approval' })
        }

        target.status = 'active'
        await target.save()

        await logAudit({
            module: 'User',
            action: `User ${target.firstName} ${target.lastName} (${target.email}) was approved`,
            user: req.user?.email || 'Unknown'
        })

        const user = await User.findById(id).select('-password')
        res.status(200).json(user)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

const updateUserRole = async (req, res) => {
    const { id } = req.params
    const { role } = req.body

    if (!['admin', 'staff'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' })
    }

    if (req.user._id.toString() === id) {
        return res.status(400).json({ error: 'You cannot change your own role' })
    }

    try {
        const oldUser = await User.findById(id)

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true }
        ).select('-password')

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        await logAudit({
            module: 'User',
            action: `User ${user.firstName} ${user.lastName} (${user.email}) role changed from ${oldUser.role} to ${role}`,
            user: req.user?.email || 'Unknown'
        })

        res.status(200).json(user)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

// GET /api/user/me — current logged-in user's profile
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password')
        if (!user) return res.status(404).json({ error: 'User not found' })
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

// PATCH /api/user/me — update current user's firstName, lastName, department,
// staffType. Email is deliberately not editable here — it's the account's
// login identifier, and self-service email changes are a common account-
// takeover vector (change email, then use it to reset the password). Any
// `email` sent to this endpoint is silently ignored; the response always
// reflects the account's real, unchanged address.
const updateMyProfile = async (req, res) => {
    const { firstName, lastName, department, staffType } = req.body

    if (firstName !== undefined && !firstName.trim()) {
        return res.status(400).json({ error: 'First name cannot be empty' })
    }
    if (lastName !== undefined && !lastName.trim()) {
        return res.status(400).json({ error: 'Last name cannot be empty' })
    }

    try {
        const updates = {}
        if (firstName  !== undefined) updates.firstName  = firstName.trim()
        if (lastName   !== undefined) updates.lastName   = lastName.trim()
        if (department !== undefined) updates.department = department.trim()
        if (staffType  !== undefined) updates.staffType  = staffType.trim()

        const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password')
        if (!user) return res.status(404).json({ error: 'User not found' })

        logAudit({
            module: 'User',
            action: `${user.email} updated their profile`,
            user: user.email,
        })

        res.status(200).json(user)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

// PATCH /api/user/me/picture — upload/replace current user's profile picture
const updateMyPicture = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' })
    }

    try {
        const user = await User.findById(req.user._id)
        if (!user) return res.status(404).json({ error: 'User not found' })

        // req.file.path is the Cloudinary secure URL, req.file.filename is
        // its public_id (see utils/cloudinaryStorage.js).
        const oldPublicId = user.picturePublicId
        user.pictureUrl = req.file.path
        user.picturePublicId = req.file.filename
        await user.save()

        // Clean up the previous image now that the new one is safely saved.
        // Fire-and-forget — a failed cleanup shouldn't fail the request.
        if (oldPublicId) {
            // invalidate: true also clears Cloudinary's CDN cache for this
            // asset — without it, the old image's URL can keep resolving
            // for a while even though it's deleted from Cloudinary's storage.
            cloudinary.uploader.destroy(oldPublicId, { invalidate: true }).catch((err) =>
                console.error('[picture] failed to delete old Cloudinary image:', err.message)
            )
        }

        logAudit({
            module: 'User',
            action: `${user.email} updated their profile picture`,
            user: user.email,
        })

        const result = await User.findById(user._id).select('-password')
        res.status(200).json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

// POST /api/user/me/password — change current user's password
const changeMyPassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required' })
    }
    if (!validator.isStrongPassword(newPassword)) {
        return res.status(400).json({ error: 'New password is not strong enough (need 8+ chars, mixed case, number, symbol)' })
    }

    try {
        const user = await User.findById(req.user._id)
        if (!user) return res.status(404).json({ error: 'User not found' })

        const match = await bcrypt.compare(currentPassword, user.password)
        if (!match) return res.status(400).json({ error: 'Current password is incorrect' })

        const salt = await bcrypt.genSalt(10)
        const hash = await bcrypt.hash(newPassword, salt)
        user.password = hash
        await user.save()

        logAudit({
            module: 'User',
            action: `${user.email} changed their password`,
            user: user.email,
        })

        res.status(200).json({ ok: true, message: 'Password updated successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

// DELETE /api/user/me — current user deletes their own account.
// Admins cannot self-delete this way, to avoid ever locking everyone out.
const deleteMyAccount = async (req, res) => {
    const { password } = req.body

    if (!password) {
        return res.status(400).json({ error: 'Password is required' })
    }

    try {
        const user = await User.findById(req.user._id)
        if (!user) return res.status(404).json({ error: 'User not found' })

        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Admin accounts cannot be self-deleted. Please contact another admin.' })
        }

        const match = await bcrypt.compare(password, user.password)
        if (!match) return res.status(400).json({ error: 'Incorrect password' })

        await User.findByIdAndDelete(user._id)

        await logAudit({
            module: 'User',
            action: `User ${user.firstName} ${user.lastName} (${user.email}) deleted their own account`,
            user: user.email
        })

        res.status(200).json({ message: 'Account deleted successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

module.exports = {
    signupUser,
    sendSignupCode,
    forgotPassword,
    resetPassword,
    loginUser,
    getUsers,
    createUserByAdmin,
    deactivateUser,
    reactivateUser,
    deleteUser,
    approveUser,
    updateUserRole,
    getMyProfile,
    updateMyProfile,
    updateMyPicture,
    changeMyPassword,
    deleteMyAccount,
}