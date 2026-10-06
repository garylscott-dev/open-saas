import subprocess
import re

def get_git_diff():
    # Get the git diff for the staged changes
    result = subprocess.run(['git', 'diff', '--cached', '--name-status'], capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception("Failed to get git diff: " + result.stderr)
    return result.stdout

def parse_diff(diff_output):
    # Parse the diff output to get a list of modified files
    changes = {}
    lines = diff_output.splitlines()
    for line in lines:
        match = re.match(r'^(A|M|D|C|R)\s+(.+)$', line)
        if match:
            action, file_path = match.groups()
            if action in ['A', 'M', 'D']:
                changes[file_path] = action
            elif action == 'R':
                # For renamed files, we need to split the line into old and new names
                old_file, new_file = file_path.split(' -> ')
                changes[old_file] = 'D'
                changes[new_file] = 'A'
            elif action == 'C':
                # For copied files, we need to split the line into old and new names
                old_file, new_file = file_path.split(' -> ')
                changes[old_file] = 'M'
                changes[new_file] = 'A'
    return changes

def format_commit_message(changes):
    # Format a conventional commit message
    types = {
        'A': 'feat',
        'M': 'fix',
        'D': 'remove'
    }

    commit_message = "chore: Update files\n\n"
    for file, action in changes.items():
        commit_message += f"- {types.get(action, 'unknown')}({file}): <description>\n"

    return commit_message

def main():
    try:
        diff_output = get_git_diff()
        changes = parse_diff(diff_output)
        commit_message = format_commit_message(changes)
        print("Suggested commit message:\n")
        print(commit_message)
    except Exception as e:
        print(str(e))

if __name__ == "__main__":
    main()
