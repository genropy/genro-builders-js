"""Sphinx configuration for genro-dom-js documentation.

This is a JavaScript project, so there is no Python autodoc: the API
reference and guides are authored in Markdown (MyST). Diagrams use
mermaid fenced blocks.
"""

# Project information
project = "genro-dom-js"
copyright = "2025, Genropy Team"
author = "Genropy Team"
release = "0.1.0"
version = "0.1"

# General configuration
extensions = [
    "myst_parser",  # Markdown support
    "sphinxcontrib.mermaid",  # Mermaid diagrams
    "sphinx.ext.githubpages",  # GitHub Pages support
    "sphinx.ext.todo",  # TODO notes support
]

# MyST Parser configuration
myst_enable_extensions = [
    "colon_fence",  # ::: fences
    "deflist",  # Definition lists
    "tasklist",  # Task lists with checkboxes
]
myst_heading_anchors = 3
myst_fence_as_directive = ["mermaid"]

source_suffix = {
    ".md": "markdown",
}

master_doc = "index"

exclude_patterns = [
    "_build",
    "Thumbs.db",
    ".DS_Store",
    "temp",
]

# HTML output
html_theme = "sphinx_rtd_theme"
html_title = "genro-dom-js"
