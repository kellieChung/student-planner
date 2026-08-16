"use client";

import {signOut} from "next-auth/react";

type UserMenuProps = {
    name?: string | null;
    email?: string | null;
};

export default function UserMenu({name, email}: UserMenuProps) {
    return(
        <div>
            <p>{name ?? "User"}</p>
            <p>{email ?? ""}</p>

            <button onClick = {() => signOut()}>
                Log Out
            </button>
        </div>
    )
}