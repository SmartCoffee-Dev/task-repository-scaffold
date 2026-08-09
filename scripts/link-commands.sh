#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMANDS_DIR="${REPO_ROOT}/commands"

usage() {
    cat <<EOF
usage: $(basename "$0") <target-dir>
       $(basename "$0") --uninstall <target-dir>

Establishes symbolic links from the agentic commands in repository's
commands/ directory into <target-dir>. Commands are .md files defining
agent behaviour; symlinks propagate upstream changes automatically after
a git pull.

Options:
  --uninstall    Remove symlinks previously created by this script.
  --help         Show this message.
EOF
}

# ---------------------------------------------------------------------------
# Helper: check whether a path is a symlink (even broken)
# ---------------------------------------------------------------------------
is_symlink() {
    [[ -L "$1" ]]
}

# ---------------------------------------------------------------------------
# Helper: resolve a symlink target (empty if broken or not a symlink)
# ---------------------------------------------------------------------------
symlink_target() {
    if is_symlink "$1"; then
        readlink "$1" || true
    fi
}

# ---------------------------------------------------------------------------
# Helper: return 0 if $1 is a symlink whose absolute target lives inside
#          COMMANDS_DIR.
# ---------------------------------------------------------------------------
points_into_commands_dir() {
    local link_path="$1"
    local target_raw
    target_raw="$(symlink_target "$link_path")"

    [[ -z "$target_raw" ]] && return 1

    local target_abs
    if [[ "$target_raw" == /* ]]; then
        target_abs="$target_raw"
    else
        target_abs="$(cd "$(dirname "$link_path")" && pwd)/$target_raw"
    fi

    [[ "$target_abs" == "${COMMANDS_DIR}/"* ]]
}

# ---------------------------------------------------------------------------
# install mode
# ---------------------------------------------------------------------------
cmd_install() {
    local target_dir="$1"

    if [[ ! -d "$target_dir" ]]; then
        echo "error: '$target_dir' does not exist or is not a directory" >&2
        exit 1
    fi

    local target_abs
    target_abs="$(cd "$target_dir" && pwd)"

    local created=0 updated=0 skipped=0 conflicts=0
    local md_files=("$COMMANDS_DIR"/*.md)

    if [[ ! -e "${md_files[0]}" ]]; then
        echo "No .md command files found in ${COMMANDS_DIR}/"
        exit 0
    fi

    for source_path in "${md_files[@]}"; do
        local name
        name="$(basename "$source_path")"
        local link_path="${target_abs}/${name}"

        if is_symlink "$link_path"; then
            local existing_target
            existing_target="$(symlink_target "$link_path")"

            local existing_abs
            if [[ "$existing_target" == /* ]]; then
                existing_abs="$existing_target"
            else
                existing_abs="$(cd "$(dirname "$link_path")" && pwd)/$existing_target"
            fi

            if [[ "$existing_abs" == "$source_path" ]]; then
                echo "skip    ${name}  (already linked correctly)"
                ((skipped += 1))
                continue
            fi

            echo "update  ${name}  (was: ${existing_target})"
            rm "$link_path"
            ln -s "$source_path" "$link_path"
            ((updated += 1))
        elif [[ -e "$link_path" ]]; then
            echo "CONFLICT ${name}  (real file exists, not overwriting)"
            ((conflicts += 1))
        else
            echo "create  ${name}"
            ln -s "$source_path" "$link_path"
            ((created += 1))
        fi
    done

    echo ""
    echo "Summary: ${created} created, ${updated} updated, ${skipped} skipped, ${conflicts} conflicts"
    if [[ "$conflicts" -gt 0 ]]; then
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# uninstall mode
# ---------------------------------------------------------------------------
cmd_uninstall() {
    local target_dir="$1"

    if [[ ! -d "$target_dir" ]]; then
        echo "error: '$target_dir' does not exist or is not a directory" >&2
        exit 1
    fi

    local target_abs
    target_abs="$(cd "$target_dir" && pwd)"

    local removed=0 kept=0
    local entries=("$target_abs"/*)

    if [[ ! -e "${entries[0]}" ]]; then
        echo "Nothing to do — target directory is empty."
        exit 0
    fi

    for entry in "${entries[@]}"; do
        local name
        name="$(basename "$entry")"

        if is_symlink "$entry" && points_into_commands_dir "$entry"; then
            echo "remove  ${name}"
            rm "$entry"
            ((removed += 1))
        elif is_symlink "$entry"; then
            echo "keep    ${name}  (does not point into commands/)"
            ((kept += 1))
        fi
    done

    echo ""
    echo "Summary: ${removed} removed, ${kept} symlinks kept (not ours)"
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
    if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
        usage
        exit 0
    fi

    if [[ "${1:-}" == "--uninstall" ]]; then
        if [[ $# -ne 2 ]]; then
            echo "error: --uninstall requires exactly one argument (target directory)" >&2
            usage
            exit 2
        fi
        cmd_uninstall "$2"
    else
        if [[ $# -ne 1 ]]; then
            echo "error: expected exactly one argument (target directory)" >&2
            usage
            exit 2
        fi
        cmd_install "$1"
    fi
}

main "$@"