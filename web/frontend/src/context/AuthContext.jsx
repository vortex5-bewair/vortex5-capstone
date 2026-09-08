import { useReducer, useEffect } from "react";
import { AuthContext } from "./authContextObject.js";

// Not exported — nothing outside this file uses it directly (consumers go
// through useAuthContext()/AuthContextProvider), and this file must export
// only components for Fast Refresh to hot-patch it (see authContextObject.js).
const authReducer = (state, action) => {
    switch (action.type) {
        case 'LOGIN':
            return { ...state, user: action.payload }
        case 'LOGOUT':
            return { ...state, user: null }
        // The stored session has been read (or found absent). Until this lands,
        // `user` is null only because the check has not run yet — which is not
        // the same as being logged out, and the router must not treat it as if
        // it were. See `authReady` below.
        case 'RESTORED':
            return { user: action.payload, authReady: true }
        default:
            return state
    }
}

// Decodes a JWT's payload without verifying the signature (verification is
// the backend's job) — just enough to read `exp` and know locally whether a
// stored token is already stale, instead of trusting it forever.
const isTokenExpired = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (!payload.exp) return false
        return Date.now() >= payload.exp * 1000
    } catch {
        return true
    }
}

export const AuthContextProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, {
        user: null,
        // False until the stored session has been read. The read happens in an
        // effect, so it cannot finish before the first render — and on that
        // first render every guarded route would otherwise see `user: null`,
        // bounce to /login, and then bounce again to "/" once the session
        // arrived. Refreshing any deep page therefore landed on the dashboard.
        authReady: false
    })

    useEffect(()=> {
        let user = null
        try {
            user = JSON.parse(localStorage.getItem('user'))
        } catch {
            // Corrupted value — drop it instead of crashing on mount.
            localStorage.removeItem('user')
        }

        const valid = !!(user && user.token && !isTokenExpired(user.token))

        if (user && !valid) {
            // Present but expired/malformed — don't leave the app "looking"
            // logged in while every real API call would 401.
            localStorage.removeItem('user')
        }

        // One dispatch either way, so `authReady` is set exactly once and the
        // router can start making decisions.
        dispatch({type: 'RESTORED', payload: valid ? user : null})
    },[])

    return(
        <AuthContext.Provider value ={{...state, dispatch}}>
            {children}
        </AuthContext.Provider>
    )
}
