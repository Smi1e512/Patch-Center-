"""Set or reset the local admin password. Stop PatchCenter first."""
from getpass import getpass

from admin_auth import set_password


def main():
    print("Stop PatchCenter before changing the administrator password.")
    password = getpass("New admin password (12-256 characters): ")
    confirmation = getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    try:
        set_password(password)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
    print("Admin password configured. All previous admin tokens are revoked.")


if __name__ == "__main__":
    main()
