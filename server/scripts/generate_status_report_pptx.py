#!/usr/bin/env python3
"""
Generate a branded PowerPoint status report from AI-generated narrative content.
Reads JSON data from stdin, outputs PPTX to the path specified as first argument.
"""

import sys
import json
import os
import re
from datetime import datetime, timedelta
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

FONT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'public', 'fonts')
FONT_NAME = 'Avenir Next LT Pro'

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))

def set_font(run, size=10, bold=False, color=None, name=FONT_NAME, italic=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if color:
        run.font.color.rgb = color if isinstance(color, RGBColor) else hex_to_rgb(color)

def set_cell_text(cell, text, size=9, bold=False, color=None, bg_color=None, alignment=PP_ALIGN.LEFT, valign=MSO_ANCHOR.MIDDLE):
    cell.text = ""
    tf = cell.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = alignment
    run = p.add_run()
    run.text = str(text)
    set_font(run, size=size, bold=bold, color=color)
    cell.vertical_anchor = valign
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color if isinstance(bg_color, RGBColor) else hex_to_rgb(bg_color)

def add_accent_bar(slide, primary_color, left=0, top=0, width=None, height=Inches(0.08)):
    if width is None:
        width = SLIDE_WIDTH
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    shape.line.fill.background()
    return shape

SECTION_ALIASES = {
    'Key Accomplishments': [
        'key accomplishments', 'accomplishments', 'progress & accomplishments',
        'progress and accomplishments', 'work completed', 'completed work',
        'key highlights', 'highlights', 'achievements',
    ],
    'Progress Summary': [
        'progress summary', 'executive summary', 'summary', 'overview',
        'project summary', 'status summary',
    ],
    'Upcoming Activities': [
        'upcoming activities', 'next steps', 'upcoming', 'looking ahead',
        'next period', 'planned activities', 'upcoming work',
    ],
    'Risks, Issues & Key Decisions (RAIDD)': [
        'risks, issues & key decisions', 'raidd', 'risks and issues',
        'risks, issues & key decisions (raidd)', 'risk summary',
        'raidd summary', 'raidd log',
    ],
}

def _normalize_section_name(raw_name):
    """Map a raw AI section header to a canonical section name."""
    lower = raw_name.lower().strip()
    lower = re.sub(r'\s*\(.*?\)\s*$', '', lower).strip()
    for canonical, aliases in SECTION_ALIASES.items():
        if lower in aliases:
            return canonical
        for alias in aliases:
            if alias in lower or lower in alias:
                return canonical
    return raw_name

def parse_markdown_sections(md_text):
    """Parse AI-generated markdown into structured sections with fuzzy header matching."""
    sections = {}
    current_section = None
    current_content = []

    for line in md_text.split('\n'):
        if line.startswith('## '):
            if current_section:
                sections[current_section] = '\n'.join(current_content).strip()
            raw_name = line[3:].strip()
            current_section = _normalize_section_name(raw_name)
            current_content = []
        else:
            current_content.append(line)

    if current_section:
        sections[current_section] = '\n'.join(current_content).strip()

    print(f"[PPTX] Parsed AI sections: {list(sections.keys())}", file=sys.stderr)
    return sections

def parse_bullet_items(text):
    """Parse markdown bullet items into structured data with bold titles and descriptions."""
    items = []
    current_item = None

    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith('- ') or stripped.startswith('* ') or stripped.startswith('• '):
            if current_item:
                items.append(current_item)
            content = stripped[2:].strip()
            bold_match = re.match(r'\*\*(.+?)\*\*\s*[-–—:]?\s*(.*)', content)
            if bold_match:
                current_item = {
                    'title': bold_match.group(1).strip(),
                    'description': bold_match.group(2).strip(),
                    'sub_items': []
                }
            else:
                current_item = {
                    'title': content,
                    'description': '',
                    'sub_items': []
                }
        elif stripped.startswith('  - ') or stripped.startswith('  * ') or stripped.startswith('  • '):
            if current_item:
                sub_content = stripped.lstrip(' -•*').strip()
                current_item['sub_items'].append(sub_content)
        elif current_item:
            if current_item['description']:
                current_item['description'] += ' ' + stripped
            else:
                current_item['description'] = stripped

    if current_item:
        items.append(current_item)

    return items

def render_markdown_text(tf, text, primary_color, size=10, start_fresh=True):
    """Render markdown text with bold formatting into a text frame."""
    if start_fresh and tf.paragraphs[0].text == '':
        started = False
    else:
        started = True

    lines = text.split('\n')
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if started:
            p = tf.add_paragraph()
        else:
            p = tf.paragraphs[0]
            started = True

        p.space_after = Pt(3)
        p.space_before = Pt(2)

        if stripped.startswith('- ') or stripped.startswith('• ') or stripped.startswith('* '):
            content = stripped[2:].strip()
            render_inline_bold(p, f"• {content}", size=size, primary_color=primary_color)
        elif stripped.startswith('  - ') or stripped.startswith('  • '):
            content = stripped.lstrip(' -•*').strip()
            p.level = 1
            render_inline_bold(p, f"  – {content}", size=size - 1, primary_color=primary_color)
        else:
            render_inline_bold(p, stripped, size=size, primary_color=primary_color)

def render_inline_bold(p, text, size=10, primary_color=None):
    """Render text with **bold** markdown formatting into a paragraph."""
    parts = re.split(r'(\*\*[^*]+\*\*)', text)
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            run = p.add_run()
            run.text = part[2:-2]
            set_font(run, size=size, bold=True, color=primary_color)
        else:
            if part:
                run = p.add_run()
                run.text = part
                set_font(run, size=size)

def create_title_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])

    bg_shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    bg_shape.fill.solid()
    bg_shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    bg_shape.line.fill.background()

    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(5.0), SLIDE_WIDTH, Inches(0.06))
    accent.fill.solid()
    accent.fill.fore_color.rgb = hex_to_rgb(secondary_color)
    accent.line.fill.background()

    txBox = slide.shapes.add_textbox(Inches(1), Inches(2.0), Inches(11), Inches(2.0))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = data.get('projectName', 'Project Status Report')
    set_font(run, size=36, bold=True, color=RGBColor(255, 255, 255))

    p2 = tf.add_paragraph()
    run2 = p2.add_run()
    run2.text = "STATUS REPORT"
    set_font(run2, size=20, color=RGBColor(220, 220, 220))

    txBox2 = slide.shapes.add_textbox(Inches(1), Inches(4.2), Inches(8), Inches(1.2))
    tf2 = txBox2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    run = p.add_run()
    run.text = data.get('clientName', '')
    set_font(run, size=16, bold=True, color=RGBColor(255, 255, 255))

    period_start = data.get('periodStart', '')
    period_end = data.get('periodEnd', '')
    report_date = data.get('reportDate', datetime.now().strftime('%B %d, %Y'))
    period_text = f"Period: {period_start} to {period_end}" if period_start and period_end else report_date

    p2 = tf2.add_paragraph()
    run2 = p2.add_run()
    run2.text = period_text
    set_font(run2, size=14, color=RGBColor(230, 230, 230))

    p3 = tf2.add_paragraph()
    run3 = p3.add_run()
    pm_name = data.get('pmName', '')
    run3.text = f"Project Manager: {pm_name}" if pm_name else report_date
    set_font(run3, size=12, color=RGBColor(200, 200, 200))

    logo_path = data.get('logoPath')
    if logo_path and os.path.exists(logo_path):
        try:
            slide.shapes.add_picture(logo_path, Inches(10.5), Inches(4.0), height=Inches(0.8))
        except Exception:
            pass

    return slide

def create_progress_summary_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 2: Progress Summary with AI-generated narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Progress Summary"
    set_font(run, size=24, bold=True, color=primary_color)

    metrics = data.get('metrics', {})
    if metrics:
        metrics_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.0), Inches(11.5), Inches(0.5))
        tf_m = metrics_box.text_frame
        p = tf_m.paragraphs[0]
        items = []
        if metrics.get('totalHours', '0') != '0':
            items.append(f"Hours: {metrics['totalHours']} ({metrics.get('billableHours', '0')} billable)")
        if metrics.get('teamMembers', 0) > 0:
            items.append(f"Team: {metrics['teamMembers']} members")
        if metrics.get('totalExpenses', '0.00') != '0.00':
            items.append(f"Expenses: ${metrics['totalExpenses']}")
        if items:
            run = p.add_run()
            run.text = "  |  ".join(items)
            set_font(run, size=9, color='#666666')

    content_top = Inches(1.6) if metrics else Inches(1.2)
    content_box = slide.shapes.add_textbox(Inches(0.8), content_top, Inches(11.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True

    desc = data.get('projectDescription', '')
    has_desc = False
    if desc:
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "Project Overview"
        set_font(run, size=12, bold=True, color=primary_color)

        p2 = tf.add_paragraph()
        p2.space_before = Pt(2)
        p2.space_after = Pt(8)
        run2 = p2.add_run()
        run2.text = desc
        set_font(run2, size=10)
        has_desc = True

    summary_text = sections.get('Progress Summary', '')
    if summary_text:
        if has_desc:
            p_sep = tf.add_paragraph()
            p_sep.space_before = Pt(4)
            run_sep = p_sep.add_run()
            run_sep.text = "Period Update"
            set_font(run_sep, size=12, bold=True, color=primary_color)
        render_markdown_text(tf, summary_text, primary_color, size=11, start_fresh=not has_desc)

    milestones = data.get('milestonePosture', {})
    if milestones and any(milestones.values()):
        p = tf.add_paragraph()
        p.space_before = Pt(14)
        run = p.add_run()
        run.text = "Milestone Posture"
        set_font(run, size=12, bold=True, color=primary_color)

        for status_label, items in milestones.items():
            if items:
                p = tf.add_paragraph()
                p.space_before = Pt(2)
                run = p.add_run()
                run.text = f"• {status_label}: "
                set_font(run, size=10, bold=True)
                run2 = p.add_run()
                run2.text = ', '.join(items)
                set_font(run2, size=10)

    return slide

def create_accomplishments_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 3: Key Accomplishments with rich AI narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Key Accomplishments"
    set_font(run, size=24, bold=True, color=primary_color)

    content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(11.5), Inches(6.0))
    tf = content_box.text_frame
    tf.word_wrap = True

    accomplishments_text = sections.get('Key Accomplishments', '')
    if accomplishments_text:
        items = parse_bullet_items(accomplishments_text)
        first = True
        for item in items:
            if first:
                p = tf.paragraphs[0]
                first = False
            else:
                p = tf.add_paragraph()

            p.space_before = Pt(6)
            p.space_after = Pt(2)

            run = p.add_run()
            run.text = f"• {item['title']}"
            set_font(run, size=11, bold=True, color=primary_color)

            if item.get('description'):
                p2 = tf.add_paragraph()
                p2.space_before = Pt(1)
                p2.space_after = Pt(4)
                run2 = p2.add_run()
                run2.text = f"  {item['description']}"
                set_font(run2, size=10)

            for sub in item.get('sub_items', []):
                p3 = tf.add_paragraph()
                p3.space_before = Pt(1)
                run3 = p3.add_run()
                run3.text = f"    – {sub}"
                set_font(run3, size=9, color='#444444')
    else:
        activities = data.get('projectActivities', {})
        prior = activities.get('prior', [])
        current = activities.get('current', [])
        has_fallback = prior or current
        if has_fallback:
            first = True
            if prior:
                if first:
                    p = tf.paragraphs[0]
                    first = False
                else:
                    p = tf.add_paragraph()
                p.space_before = Pt(6)
                run = p.add_run()
                run.text = f"Completed Tasks ({len(prior)})"
                set_font(run, size=13, bold=True, color=primary_color)
                for act in prior[:15]:
                    p2 = tf.add_paragraph()
                    p2.space_before = Pt(3)
                    p2.space_after = Pt(2)
                    run2 = p2.add_run()
                    run2.text = f"  \u2713 {act}"
                    set_font(run2, size=9)
                if len(prior) > 15:
                    p2 = tf.add_paragraph()
                    run2 = p2.add_run()
                    run2.text = f"    ... and {len(prior) - 15} more completed tasks"
                    set_font(run2, size=9, italic=True, color='#666666')
            if current:
                p = tf.add_paragraph()
                p.space_before = Pt(10)
                run = p.add_run()
                run.text = f"In Progress ({len(current)})"
                set_font(run, size=13, bold=True, color=primary_color)
                for act in current[:15]:
                    p2 = tf.add_paragraph()
                    p2.space_before = Pt(3)
                    p2.space_after = Pt(2)
                    run2 = p2.add_run()
                    run2.text = f"  \u25B8 {act}"
                    set_font(run2, size=9)
                if len(current) > 15:
                    p2 = tf.add_paragraph()
                    run2 = p2.add_run()
                    run2.text = f"    ... and {len(current) - 15} more in-progress tasks"
                    set_font(run2, size=9, italic=True, color='#666666')
        else:
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = "No accomplishments data available for this period."
            set_font(run, size=11, color='#888888')

    return slide

PRIORITY_COLORS = {
    'critical': '#DC2626',
    'high': '#EA580C',
    'medium': '#CA8A04',
    'low': '#16A34A',
}

STATUS_COLORS = {
    'open': '#3B82F6',
    'in_progress': '#F59E0B',
    'mitigated': '#8B5CF6',
    'resolved': '#22C55E',
    'closed': '#6B7280',
    'deferred': '#9CA3AF',
    'superseded': '#9CA3AF',
    'accepted': '#22C55E',
}

RAIDD_OPEN_STATUSES = ('open', 'in_progress')


def _classify_raidd(raidd_raw):
    """Classify flat raidd array into typed buckets."""
    buckets = {
        'risk': [],
        'action_item': [],
        'issue': [],
        'decision': [],
        'dependency': [],
    }
    if isinstance(raidd_raw, list):
        for entry in raidd_raw:
            t = entry.get('type', '')
            if t in buckets:
                buckets[t].append(entry)
    elif isinstance(raidd_raw, dict):
        buckets['risk'] = raidd_raw.get('risks', [])
        buckets['issue'] = raidd_raw.get('issues', [])
        buckets['action_item'] = raidd_raw.get('actionItems', [])
        buckets['decision'] = raidd_raw.get('decisions', [])
        buckets['dependency'] = raidd_raw.get('dependencies', [])
    return buckets


def _priority_sort_key(entry):
    order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    return order.get(entry.get('priority', 'medium'), 2)


def _add_raidd_table_slide(prs, title_text, subtitle_text, entries, columns, col_widths, primary_color, secondary_color, page_num=None, total_pages=None):
    """Create a single RAIDD category slide with a structured table."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    page_label = f" ({page_num}/{total_pages})" if total_pages and total_pages > 1 else ""
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.25), Inches(10), Inches(0.5))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = f"{title_text}{page_label}"
    set_font(run, size=20, bold=True, color=primary_color)

    if subtitle_text and page_num in (1, None):
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.72), Inches(12), Inches(0.3))
        stf = sub_box.text_frame
        sp = stf.paragraphs[0]
        srun = sp.add_run()
        srun.text = subtitle_text
        set_font(srun, size=9, color='#888888')

    table_top = Inches(1.05) if (subtitle_text and page_num in (1, None)) else Inches(0.85)
    max_rows_per_page = 14
    display_entries = entries[:max_rows_per_page]
    rows = len(display_entries) + 1
    cols = len(columns)

    table_shape = slide.shapes.add_table(rows, cols, Inches(0.2), table_top, sum(col_widths), Inches(0.38 * rows))
    table = table_shape.table
    for i, w in enumerate(col_widths):
        table.columns[i].width = w

    for i, (header, _) in enumerate(columns):
        set_cell_text(table.cell(0, i), header, size=8, bold=True, color='#FFFFFF', bg_color=primary_color, alignment=PP_ALIGN.LEFT)

    for row_idx, entry in enumerate(display_entries):
        r = row_idx + 1
        bg = '#FFFFFF' if r % 2 == 1 else '#F5F5FA'
        for col_idx, (_, extractor) in enumerate(columns):
            val, cell_opts = extractor(entry)
            color = cell_opts.get('color', None)
            bold = cell_opts.get('bold', False)
            set_cell_text(table.cell(r, col_idx), val, size=7, bold=bold, color=color, bg_color=bg, alignment=PP_ALIGN.LEFT)

    return slide


def _truncate(text, max_len=60):
    if not text:
        return ''
    return text[:max_len - 3] + '...' if len(text) > max_len else text


def create_raidd_slides(prs, data, sections, primary_color, secondary_color):
    """Generate RAIDD slides: a summary slide followed by per-category table slides."""
    raidd_raw = data.get('raidd', [])
    buckets = _classify_raidd(raidd_raw)

    open_statuses = RAIDD_OPEN_STATUSES

    risks = sorted(buckets['risk'], key=_priority_sort_key)
    actions = sorted(buckets['action_item'], key=_priority_sort_key)
    issues = sorted(buckets['issue'], key=_priority_sort_key)
    decisions = buckets['decision']
    dependencies = sorted(buckets['dependency'], key=_priority_sort_key)

    active_risks = [e for e in risks if e.get('status') in open_statuses]
    active_issues = [e for e in issues if e.get('status') in open_statuses]
    active_actions = [e for e in actions if e.get('status') in open_statuses]
    active_deps = [e for e in dependencies if e.get('status') in open_statuses]
    total_active = len(active_risks) + len(active_issues) + len(active_actions) + len(active_deps)

    critical_count = sum(1 for e in (active_risks + active_issues + active_actions + active_deps) if e.get('priority') == 'critical')
    high_count = sum(1 for e in (active_risks + active_issues + active_actions + active_deps) if e.get('priority') == 'high')

    overdue_actions = [e for e in active_actions if e.get('dueDate') and e['dueDate'] < datetime.now().strftime('%Y-%m-%d')]

    # --- RAIDD Summary Slide ---
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.25), Inches(10), Inches(0.5))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "RAIDD Log Overview"
    set_font(run, size=22, bold=True, color=primary_color)

    categories_summary = [
        ('Risks', len(active_risks), len(risks), '#DC2626'),
        ('Action Items', len(active_actions), len(actions), '#EA580C'),
        ('Issues', len(active_issues), len(issues), '#CA8A04'),
        ('Decisions', len(decisions), len(decisions), '#3B82F6'),
        ('Dependencies', len(active_deps), len(dependencies), '#8B5CF6'),
    ]

    card_y = Inches(0.95)
    card_w = Inches(2.3)
    card_h = Inches(1.1)
    card_gap = Inches(0.25)
    start_x = Inches(0.5)

    for idx, (cat_name, active_count, total_count, accent) in enumerate(categories_summary):
        x = start_x + idx * (card_w + card_gap)
        card_bg = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, card_y, card_w, card_h)
        card_bg.fill.solid()
        card_bg.fill.fore_color.rgb = hex_to_rgb('#F8F8FC')
        card_bg.line.color.rgb = hex_to_rgb('#E5E5EA')
        card_bg.line.width = Pt(0.5)

        accent_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, card_y, card_w, Inches(0.05))
        accent_bar.fill.solid()
        accent_bar.fill.fore_color.rgb = hex_to_rgb(accent)
        accent_bar.line.fill.background()

        num_box = slide.shapes.add_textbox(x + Inches(0.15), card_y + Inches(0.15), card_w - Inches(0.3), Inches(0.5))
        ntf = num_box.text_frame
        np = ntf.paragraphs[0]
        np.alignment = PP_ALIGN.LEFT
        nrun = np.add_run()
        nrun.text = str(active_count)
        set_font(nrun, size=28, bold=True, color=accent)

        label_box = slide.shapes.add_textbox(x + Inches(0.15), card_y + Inches(0.65), card_w - Inches(0.3), Inches(0.35))
        ltf = label_box.text_frame
        lp = ltf.paragraphs[0]
        lp.alignment = PP_ALIGN.LEFT
        lrun = lp.add_run()
        lrun.text = f"{cat_name}"
        set_font(lrun, size=10, bold=True, color='#333333')
        if total_count != active_count:
            lrun2 = lp.add_run()
            lrun2.text = f"  ({total_count} total)"
            set_font(lrun2, size=8, color='#888888')

    alert_y = card_y + card_h + Inches(0.3)
    alerts = []
    if critical_count > 0:
        alerts.append(f"⚠ {critical_count} CRITICAL item{'s' if critical_count != 1 else ''} require immediate attention")
    if high_count > 0:
        alerts.append(f"▲ {high_count} HIGH priority item{'s' if high_count != 1 else ''}")
    if overdue_actions:
        alerts.append(f"⏰ {len(overdue_actions)} overdue action item{'s' if len(overdue_actions) != 1 else ''}")

    if alerts:
        alert_box = slide.shapes.add_textbox(Inches(0.5), alert_y, Inches(12), Inches(0.6))
        atf = alert_box.text_frame
        atf.word_wrap = True
        for i, alert_text in enumerate(alerts):
            ap = atf.paragraphs[0] if i == 0 else atf.add_paragraph()
            ap.space_before = Pt(2)
            arun = ap.add_run()
            arun.text = alert_text
            color = '#DC2626' if 'CRITICAL' in alert_text else ('#EA580C' if 'HIGH' in alert_text else '#B45309')
            set_font(arun, size=10, bold=True, color=color)
        alert_y += Inches(0.15) * len(alerts) + Inches(0.3)

    raidd_section_text = ''
    for key in sections:
        if 'raidd' in key.lower() or 'risk' in key.lower():
            raidd_section_text = sections[key]
            break

    if raidd_section_text:
        narrative_y = alert_y if alerts else card_y + card_h + Inches(0.3)
        narrative_box = slide.shapes.add_textbox(Inches(0.5), narrative_y, Inches(12.3), Inches(7.0 - narrative_y / Inches(1)))
        ntf = narrative_box.text_frame
        ntf.word_wrap = True
        render_markdown_text(ntf, raidd_section_text, primary_color, size=9)

    # --- Per-category detail slides ---
    max_rows_per_page = 14

    def _priority_cell(entry):
        p = entry.get('priority', '')
        return (p.upper() if p else '—', {'color': PRIORITY_COLORS.get(p, '#888888'), 'bold': True})

    def _status_cell(entry):
        s = entry.get('status', '')
        label = s.replace('_', ' ').title() if s else '—'
        return (label, {'color': STATUS_COLORS.get(s, '#888888'), 'bold': True})

    def _owner_cell(entry):
        return (entry.get('ownerName', '') or entry.get('assigneeName', '') or '—', {})

    def _ref_cell(entry):
        return (entry.get('refNumber', '') or '—', {'bold': True})

    def _title_cell(entry):
        return (_truncate(entry.get('title', ''), 55), {})

    def _due_cell(entry):
        d = entry.get('dueDate', '')
        if d and d < datetime.now().strftime('%Y-%m-%d') and entry.get('status') in RAIDD_OPEN_STATUSES:
            return (d, {'color': '#DC2626', 'bold': True})
        return (d or '—', {})

    def _desc_cell(entry):
        return (_truncate(entry.get('description', '') or entry.get('mitigationPlan', '') or '', 80), {})

    def _impact_cell(entry):
        imp = entry.get('impact', '')
        return (imp.title() if imp else '—', {'color': PRIORITY_COLORS.get(imp, '#888888')})

    def _likelihood_cell(entry):
        lk = entry.get('likelihood', '')
        return (lk.replace('_', ' ').title() if lk else '—', {})

    def _mitigation_cell(entry):
        return (_truncate(entry.get('mitigationPlan', '') or '', 70), {})

    def _resolution_cell(entry):
        return (_truncate(entry.get('resolutionNotes', '') or '', 70), {})

    def _paginate_category(entries, title, subtitle, columns, col_widths):
        if not entries:
            return
        pages = []
        for i in range(0, len(entries), max_rows_per_page):
            pages.append(entries[i:i + max_rows_per_page])

        total_pages = len(pages)
        for page_idx, page_entries in enumerate(pages):
            _add_raidd_table_slide(
                prs, title, subtitle, page_entries,
                columns, col_widths, primary_color, secondary_color,
                page_num=page_idx + 1, total_pages=total_pages,
            )

    # Risks table
    if risks:
        active_label = f"{len(active_risks)} active" if active_risks else "None active"
        _paginate_category(
            risks,
            "Risks",
            f"{len(risks)} total  |  {active_label}  |  {sum(1 for r in active_risks if r.get('priority') == 'critical')} critical",
            [
                ('Ref', _ref_cell),
                ('Risk', _title_cell),
                ('Priority', _priority_cell),
                ('Impact', _impact_cell),
                ('Likelihood', _likelihood_cell),
                ('Status', _status_cell),
                ('Owner', _owner_cell),
                ('Mitigation', _mitigation_cell),
            ],
            [Inches(0.7), Inches(2.8), Inches(0.9), Inches(0.8), Inches(1.0), Inches(1.0), Inches(1.3), Inches(4.2)],
        )

    # Action Items table
    if actions:
        overdue_label = f"  |  {len(overdue_actions)} overdue" if overdue_actions else ""
        _paginate_category(
            actions,
            "Action Items",
            f"{len(actions)} total  |  {len(active_actions)} open{overdue_label}",
            [
                ('Ref', _ref_cell),
                ('Action', _title_cell),
                ('Priority', _priority_cell),
                ('Status', _status_cell),
                ('Assignee', _owner_cell),
                ('Due Date', _due_cell),
                ('Notes', _desc_cell),
            ],
            [Inches(0.7), Inches(3.0), Inches(0.9), Inches(1.0), Inches(1.5), Inches(1.1), Inches(4.5)],
        )

    # Issues table
    if issues:
        _paginate_category(
            issues,
            "Issues",
            f"{len(issues)} total  |  {len(active_issues)} active",
            [
                ('Ref', _ref_cell),
                ('Issue', _title_cell),
                ('Priority', _priority_cell),
                ('Status', _status_cell),
                ('Owner', _owner_cell),
                ('Resolution', _resolution_cell),
            ],
            [Inches(0.7), Inches(3.2), Inches(0.9), Inches(1.0), Inches(1.5), Inches(5.4)],
        )

    # Decisions table
    if decisions:
        _paginate_category(
            decisions,
            "Decisions",
            f"{len(decisions)} total",
            [
                ('Ref', _ref_cell),
                ('Decision', _title_cell),
                ('Status', _status_cell),
                ('Owner', _owner_cell),
                ('Resolution / Rationale', _resolution_cell),
            ],
            [Inches(0.7), Inches(3.5), Inches(1.0), Inches(1.5), Inches(6.0)],
        )

    # Dependencies table
    if dependencies:
        _paginate_category(
            dependencies,
            "Dependencies",
            f"{len(dependencies)} total  |  {len(active_deps)} active",
            [
                ('Ref', _ref_cell),
                ('Dependency', _title_cell),
                ('Priority', _priority_cell),
                ('Status', _status_cell),
                ('Owner', _owner_cell),
                ('Due Date', _due_cell),
                ('Notes', _desc_cell),
            ],
            [Inches(0.7), Inches(3.0), Inches(0.9), Inches(1.0), Inches(1.5), Inches(1.1), Inches(4.5)],
        )

def create_upcoming_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 5: Upcoming Activities with AI narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Upcoming Activities"
    set_font(run, size=24, bold=True, color=primary_color)

    content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(11.5), Inches(6.0))
    tf = content_box.text_frame
    tf.word_wrap = True

    upcoming_text = sections.get('Upcoming Activities', '')
    if upcoming_text:
        items = parse_bullet_items(upcoming_text)
        first = True
        for item in items:
            if first:
                p = tf.paragraphs[0]
                first = False
            else:
                p = tf.add_paragraph()

            p.space_before = Pt(6)
            p.space_after = Pt(2)

            run = p.add_run()
            run.text = f"• {item['title']}"
            set_font(run, size=11, bold=True, color=primary_color)

            if item.get('description'):
                p2 = tf.add_paragraph()
                p2.space_before = Pt(1)
                p2.space_after = Pt(4)
                run2 = p2.add_run()
                run2.text = f"  {item['description']}"
                set_font(run2, size=10)

            for sub in item.get('sub_items', []):
                p3 = tf.add_paragraph()
                p3.space_before = Pt(1)
                run3 = p3.add_run()
                run3.text = f"    – {sub}"
                set_font(run3, size=9, color='#444444')
    else:
        activities = data.get('projectActivities', {})
        upcoming = activities.get('upcoming', [])
        if upcoming:
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = f"Scheduled Tasks ({len(upcoming)})"
            set_font(run, size=13, bold=True, color=primary_color)
            for act in upcoming[:18]:
                p2 = tf.add_paragraph()
                p2.space_before = Pt(3)
                p2.space_after = Pt(2)
                run2 = p2.add_run()
                run2.text = f"  \u25B8 {act}"
                set_font(run2, size=9)
            if len(upcoming) > 18:
                p2 = tf.add_paragraph()
                run2 = p2.add_run()
                run2.text = f"    ... and {len(upcoming) - 18} more scheduled tasks"
                set_font(run2, size=9, italic=True, color='#666666')
        else:
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = "No upcoming activities data available."
            set_font(run, size=11, color='#888888')

    return slide

def create_timeline_slide(prs, data, primary_color, secondary_color):
    """Slide 6: Timeline & Milestones - Gantt chart with native PowerPoint shapes."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Timeline & Milestones"
    set_font(run, size=24, bold=True, color=primary_color)

    timeline = data.get('timeline', {})
    epic_groups = timeline.get('epicGroups', [])
    unlinked_milestones = timeline.get('unlinkedMilestones', [])
    payment_milestones = timeline.get('paymentMilestones', [])
    all_milestones = data.get('milestones', [])

    has_epic_data = any(eg.get('stages') for eg in epic_groups)
    has_any_data = has_epic_data or unlinked_milestones or payment_milestones or all_milestones

    if not has_any_data:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No timeline data available for this project."
        set_font(run, size=12, color='#666666')
        return slide

    all_dates = []
    for eg in epic_groups:
        for stage in eg.get('stages', []):
            if stage.get('startDate'):
                all_dates.append(stage['startDate'])
            if stage.get('endDate'):
                all_dates.append(stage['endDate'])
        for ms in eg.get('milestones', []):
            if ms.get('targetDate'):
                all_dates.append(ms['targetDate'])
    for ms in unlinked_milestones:
        if ms.get('targetDate'):
            all_dates.append(ms['targetDate'])
    for ms in payment_milestones:
        if ms.get('targetDate'):
            all_dates.append(ms['targetDate'])

    has_gantt_dates = len(all_dates) > 0

    if has_gantt_dates:
        all_dates.sort()
        min_date = datetime.strptime(all_dates[0][:10], '%Y-%m-%d')
        max_date = datetime.strptime(all_dates[-1][:10], '%Y-%m-%d')

        padding_days = max(7, int((max_date - min_date).days * 0.05))
        chart_start = min_date - timedelta(days=padding_days)
        chart_end = max_date + timedelta(days=padding_days)
        total_days = max((chart_end - chart_start).days, 1)

        label_width = Inches(2.8)
        chart_left = Inches(3.2)
        chart_width_in = 9.5
        chart_width = Inches(chart_width_in)
        chart_top = Inches(1.3)
        row_height = Inches(0.35)
        epic_header_height = Inches(0.30)
        milestone_dot_size = Inches(0.18)

        def date_to_x(date_str):
            d = datetime.strptime(date_str[:10], '%Y-%m-%d')
            frac = (d - chart_start).days / total_days
            return chart_left + Emu(int(chart_width_in * frac * 914400))

        bar_colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#7c3aed', '#4f46e5', '#818cf8', '#c084fc', '#a855f7']

        _draw_month_axis(slide, chart_start, chart_end, chart_left, chart_width, chart_top, total_days, primary_color)

        y_cursor = chart_top + Inches(0.35)
        color_idx = 0

        for eg in epic_groups:
            epic_name = eg.get('epicName', 'Unnamed Epic')
            stages = eg.get('stages', [])
            ms_list = eg.get('milestones', [])

            if not stages and not ms_list:
                continue

            epic_label = slide.shapes.add_textbox(Inches(0.4), y_cursor, label_width, epic_header_height)
            tf = epic_label.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = epic_name
            set_font(run, size=9, bold=True, color=primary_color)
            y_cursor += epic_header_height

            for stage in stages:
                start_str = stage.get('startDate', '')
                end_str = stage.get('endDate', '')

                stage_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width - Inches(0.2), row_height)
                tf = stage_label.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.alignment = PP_ALIGN.RIGHT
                run = p.add_run()
                stage_name = stage.get('name', '')
                if start_str and end_str:
                    run.text = stage_name
                else:
                    run.text = f"{stage_name}  (no dates)"
                set_font(run, size=8, color='#333333')

                if start_str and end_str:
                    bar_left = date_to_x(start_str)
                    bar_right = date_to_x(end_str)
                    bar_w = max(bar_right - bar_left, Emu(int(914400 * 0.1)))
                    bar_h = Inches(0.22)
                    bar_top = y_cursor + Inches(0.06)

                    bar_color = bar_colors[color_idx % len(bar_colors)]
                    bar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, bar_left, bar_top, bar_w, bar_h)
                    bar.fill.solid()
                    bar.fill.fore_color.rgb = hex_to_rgb(bar_color)
                    bar.line.fill.background()

                    if bar_w > Emu(int(914400 * 1.2)):
                        bar_tf = bar.text_frame
                        bar_tf.word_wrap = False
                        bp = bar_tf.paragraphs[0]
                        bp.alignment = PP_ALIGN.CENTER
                        brun = bp.add_run()
                        s = datetime.strptime(start_str[:10], '%Y-%m-%d')
                        e = datetime.strptime(end_str[:10], '%Y-%m-%d')
                        brun.text = f"{s.strftime('%b %d')} – {e.strftime('%b %d')}"
                        set_font(brun, size=6, color='#FFFFFF', bold=True)

                y_cursor += row_height
                color_idx += 1

            for ms in ms_list:
                if not ms.get('targetDate'):
                    continue
                _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, milestone_dot_size)
                y_cursor += Inches(0.28)

        if unlinked_milestones:
            ul_label = slide.shapes.add_textbox(Inches(0.4), y_cursor, label_width, epic_header_height)
            tf = ul_label.text_frame
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = "Project Milestones"
            set_font(run, size=9, bold=True, color=primary_color)
            y_cursor += epic_header_height

            for ms in unlinked_milestones:
                if not ms.get('targetDate'):
                    continue
                _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, milestone_dot_size)
                y_cursor += Inches(0.28)

        if payment_milestones:
            _draw_payment_milestones_section(slide, payment_milestones, y_cursor, primary_color, secondary_color, date_to_x if has_gantt_dates else None)

    else:
        y_cursor = Inches(1.3)
        _draw_epic_stages_list(slide, epic_groups, y_cursor, primary_color)
        y_cursor_after = Inches(1.3) + Inches(0.3) * sum(1 + len(eg.get('stages', [])) for eg in epic_groups if eg.get('stages'))
        if payment_milestones:
            _draw_payment_milestones_section(slide, payment_milestones, y_cursor_after, primary_color, secondary_color, None)

    return slide


def _draw_month_axis(slide, chart_start, chart_end, chart_left, chart_width, chart_top, total_days, primary_color):
    """Draw month labels along the top axis of the Gantt chart."""
    chart_width_in = 9.5

    axis_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, chart_left, chart_top + Inches(0.28), chart_width, Inches(0.01))
    axis_line.fill.solid()
    axis_line.fill.fore_color.rgb = hex_to_rgb('#cccccc')
    axis_line.line.fill.background()

    current = datetime(chart_start.year, chart_start.month, 1)
    while current <= chart_end:
        if current >= chart_start:
            frac = (current - chart_start).days / total_days
            x = chart_left + Emu(int(chart_width_in * frac * 914400))

            tick = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, chart_top + Inches(0.25), Inches(0.01), Inches(0.06))
            tick.fill.solid()
            tick.fill.fore_color.rgb = hex_to_rgb('#aaaaaa')
            tick.line.fill.background()

            label_box = slide.shapes.add_textbox(x - Inches(0.3), chart_top, Inches(0.8), Inches(0.25))
            tf = label_box.text_frame
            tf.word_wrap = False
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = current.strftime('%b %Y')
            set_font(run, size=7, color='#666666')

        if current.month == 12:
            current = datetime(current.year + 1, 1, 1)
        else:
            current = datetime(current.year, current.month + 1, 1)


def _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, dot_size):
    """Draw a single milestone as a diamond dot with label."""
    target = ms.get('targetDate', '')
    if not target:
        return

    x = date_to_x(target)
    dot_top = y_cursor + Inches(0.04)

    status = ms.get('status', '')
    if status == 'completed':
        dot_color = '#22c55e'
    elif status == 'in-progress':
        dot_color = '#3b82f6'
    else:
        dot_color = secondary_color

    dot = slide.shapes.add_shape(MSO_SHAPE.DIAMOND, x - dot_size // 2, dot_top, dot_size, dot_size)
    dot.fill.solid()
    dot.fill.fore_color.rgb = hex_to_rgb(dot_color)
    dot.line.fill.background()

    ms_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width - Inches(0.2), Inches(0.25))
    tf = ms_label.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    run = p.add_run()
    ms_name = ms.get('name', '')
    is_payment = ms.get('isPayment', False)
    label_suffix = ' $' if is_payment else ''
    d = datetime.strptime(target[:10], '%Y-%m-%d')
    run.text = f"{ms_name}{label_suffix} ({d.strftime('%b %d')})"
    set_font(run, size=7, color='#555555', italic=True)


def _draw_payment_milestones_section(slide, payment_milestones, y_cursor, primary_color, secondary_color, date_to_x_fn):
    """Draw payment milestones section below the Gantt chart."""
    if not payment_milestones:
        return y_cursor

    label_width = Inches(2.8)
    epic_header_height = Inches(0.30)
    row_height = Inches(0.28)

    header = slide.shapes.add_textbox(Inches(0.4), y_cursor, Inches(4), epic_header_height)
    tf = header.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Payment Milestones"
    set_font(run, size=9, bold=True, color=primary_color)
    y_cursor += epic_header_height

    for ms in payment_milestones:
        ms_name = ms.get('name', '')
        status = ms.get('status', '')
        target_date = ms.get('targetDate', '')

        status_icon = ''
        dot_color = secondary_color
        if status == 'completed':
            status_icon = ' \u2713'
            dot_color = '#22c55e'
        elif status == 'in-progress':
            status_icon = ' \u25B6'
            dot_color = '#3b82f6'

        ms_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width - Inches(0.2), Inches(0.25))
        tf = ms_label.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.RIGHT
        run = p.add_run()
        date_display = ''
        if target_date:
            try:
                d = datetime.strptime(target_date[:10], '%Y-%m-%d')
                date_display = f" ({d.strftime('%b %d')})"
            except:
                pass
        run.text = f"$ {ms_name}{status_icon}{date_display}"
        set_font(run, size=8, color='#333333', bold=True)

        if target_date and date_to_x_fn:
            dot_size = Inches(0.16)
            x = date_to_x_fn(target_date)
            dot_top = y_cursor + Inches(0.04)
            dot = slide.shapes.add_shape(MSO_SHAPE.DIAMOND, x - dot_size // 2, dot_top, dot_size, dot_size)
            dot.fill.solid()
            dot.fill.fore_color.rgb = hex_to_rgb(dot_color)
            dot.line.fill.background()
        else:
            status_txt = status.replace('-', ' ').title() if status else 'Pending'
            status_label = slide.shapes.add_textbox(Inches(3.2), y_cursor, Inches(2), Inches(0.25))
            tf = status_label.text_frame
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = status_txt
            font_color = '#22c55e' if status == 'completed' else '#3b82f6' if status == 'in-progress' else '#9ca3af'
            set_font(run, size=7, color=font_color, italic=True)

        y_cursor += row_height

    return y_cursor


def _draw_epic_stages_list(slide, epic_groups, y_cursor, primary_color):
    """Draw a simple list of epics and their stages when no date data is available for Gantt bars."""
    label_width = Inches(10)
    epic_header_height = Inches(0.30)
    row_height = Inches(0.25)

    for eg in epic_groups:
        epic_name = eg.get('epicName', 'Unnamed Epic')
        stages = eg.get('stages', [])
        if not stages:
            continue

        epic_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width, epic_header_height)
        tf = epic_label.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = epic_name
        set_font(run, size=10, bold=True, color=primary_color)
        y_cursor += epic_header_height

        for stage in stages:
            stage_label = slide.shapes.add_textbox(Inches(1.0), y_cursor, label_width, row_height)
            tf = stage_label.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = f"\u2022  {stage.get('name', '')}"
            set_font(run, size=9, color='#444444')
            y_cursor += row_height

    return y_cursor


def _draw_milestone_table_fallback(slide, milestones, primary_color):
    """Fallback: draw a simple milestone table when no Gantt data is available."""
    if not milestones:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No milestones defined for this project."
        set_font(run, size=12, color='#666666')
        return

    num_rows = min(len(milestones) + 1, 16)
    table = slide.shapes.add_table(num_rows, 4, Inches(0.4), Inches(1.1), Inches(12.4), Inches(0.35 * num_rows)).table
    table.columns[0].width = Inches(5.0)
    table.columns[1].width = Inches(2.5)
    table.columns[2].width = Inches(2.5)
    table.columns[3].width = Inches(2.4)

    headers = ['Milestone', 'Target Date', 'Status', 'Dates']
    for i, header in enumerate(headers):
        set_cell_text(table.cell(0, i), header, size=9, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))

    for row_idx, ms in enumerate(milestones[:15]):
        r = row_idx + 1
        set_cell_text(table.cell(r, 0), ms.get('name', ''), size=9)
        set_cell_text(table.cell(r, 1), ms.get('targetDate', ''), size=9)

        status = ms.get('status', '')
        status_color = None
        if status == 'completed':
            status_color = '#22c55e'
        elif status == 'in-progress':
            status_color = '#3b82f6'
        elif status == 'not-started':
            status_color = '#9ca3af'
        set_cell_text(table.cell(r, 2), status.replace('-', ' ').title(), size=9, color=status_color)

        dates = ''
        if ms.get('startDate') and ms.get('endDate'):
            dates = f"{ms['startDate']} – {ms['endDate']}"
        elif ms.get('startDate'):
            dates = ms['startDate']
        set_cell_text(table.cell(r, 3), dates, size=9)

def create_project_plan_slides(prs, data, primary_color, secondary_color):
    """Project Plan slides: assignments grouped by epic → stage, sorted by start date.
    Single line per assignment. Auto-paginates across multiple slides."""
    project_plan = data.get('projectPlan')
    if not project_plan:
        return

    groups = project_plan.get('groups', [])
    plan_filter = project_plan.get('filter', 'open')
    if not groups:
        return

    PAGE_TOP = Inches(1.1)
    PAGE_BOTTOM = Inches(7.0)
    LEFT_MARGIN = Inches(0.5)
    CONTENT_WIDTH = Inches(12.3)
    EPIC_HEIGHT = Inches(0.32)
    STAGE_HEIGHT = Inches(0.28)
    ROW_HEIGHT = Inches(0.24)
    HEADER_HEIGHT = Inches(0.28)

    STATUS_ICONS = {
        'open': '\u25CB',
        'in_progress': '\u25D2',
        'completed': '\u2713',
        'cancelled': '\u2717',
    }
    STATUS_COLORS = {
        'open': '#9ca3af',
        'in_progress': '#3b82f6',
        'completed': '#22c55e',
        'cancelled': '#ef4444',
    }

    flat_items = []
    for group in groups:
        epic_name = group.get('epicName', 'Unnamed Epic')
        flat_items.append(('epic', epic_name, None))
        for stage_data in group.get('stages', []):
            stage_name = stage_data.get('stageName', '')
            flat_items.append(('stage', stage_name, None))
            for assignment in stage_data.get('assignments', []):
                flat_items.append(('assignment', None, assignment))

    def item_height(item_type):
        if item_type == 'epic':
            return EPIC_HEIGHT
        elif item_type == 'stage':
            return STAGE_HEIGHT
        else:
            return ROW_HEIGHT

    def start_new_slide(page_num):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        add_accent_bar(slide, primary_color, top=0)

        txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
        tf = txBox.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        filter_label = "All Assignments" if plan_filter == 'all' else "Open Assignments"
        suffix = f" (Page {page_num})" if page_num > 1 else ""
        run.text = f"Project Plan — {filter_label}{suffix}"
        set_font(run, size=22, bold=True, color=primary_color)

        y = PAGE_TOP
        cols = [
            (Inches(0.3), 'Status'),
            (Inches(2.8), 'Assignee'),
            (Inches(3.8), 'Task'),
            (Inches(1.3), 'Hours'),
            (Inches(1.5), 'Start'),
            (Inches(1.5), 'End'),
        ]
        x = LEFT_MARGIN
        for col_w, col_label in cols:
            hdr = slide.shapes.add_textbox(x, y, col_w, HEADER_HEIGHT)
            tf_h = hdr.text_frame
            tf_h.word_wrap = False
            p_h = tf_h.paragraphs[0]
            run_h = p_h.add_run()
            run_h.text = col_label
            set_font(run_h, size=7, bold=True, color='#666666')
            x += col_w

        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, LEFT_MARGIN, y + HEADER_HEIGHT - Inches(0.02), CONTENT_WIDTH, Inches(0.01))
        line.fill.solid()
        line.fill.fore_color.rgb = hex_to_rgb('#dddddd')
        line.line.fill.background()

        return slide, y + HEADER_HEIGHT

    page_num = 1
    slide, y_cursor = start_new_slide(page_num)

    for item_type, label, assignment in flat_items:
        h = item_height(item_type)
        if y_cursor + h > PAGE_BOTTOM:
            page_num += 1
            slide, y_cursor = start_new_slide(page_num)

        if item_type == 'epic':
            bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, LEFT_MARGIN, y_cursor, CONTENT_WIDTH, EPIC_HEIGHT)
            bg.fill.solid()
            bg.fill.fore_color.rgb = hex_to_rgb(primary_color)
            bg.line.fill.background()

            epic_txt = slide.shapes.add_textbox(LEFT_MARGIN + Inches(0.15), y_cursor, Inches(10), EPIC_HEIGHT)
            tf = epic_txt.text_frame
            tf.word_wrap = False
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            run = p.add_run()
            run.text = label
            set_font(run, size=9, bold=True, color=RGBColor(255, 255, 255))
            y_cursor += EPIC_HEIGHT

        elif item_type == 'stage':
            bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, LEFT_MARGIN, y_cursor, CONTENT_WIDTH, STAGE_HEIGHT)
            bg.fill.solid()
            bg.fill.fore_color.rgb = hex_to_rgb('#f0f0f0')
            bg.line.fill.background()

            stage_txt = slide.shapes.add_textbox(LEFT_MARGIN + Inches(0.3), y_cursor, Inches(10), STAGE_HEIGHT)
            tf = stage_txt.text_frame
            tf.word_wrap = False
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = label
            set_font(run, size=8, bold=True, color='#333333')
            y_cursor += STAGE_HEIGHT

        else:
            status = assignment.get('status', 'open')
            icon = STATUS_ICONS.get(status, '\u25CB')
            icon_color = STATUS_COLORS.get(status, '#9ca3af')

            assignee = assignment.get('assignee', '')
            task = assignment.get('task', '')
            hours = assignment.get('hours', 0)
            start_d = assignment.get('startDate', '')
            end_d = assignment.get('endDate', '')

            if start_d:
                try:
                    sd = datetime.strptime(start_d[:10], '%Y-%m-%d')
                    start_d = sd.strftime('%b %d, %Y')
                except:
                    pass
            if end_d:
                try:
                    ed = datetime.strptime(end_d[:10], '%Y-%m-%d')
                    end_d = ed.strftime('%b %d, %Y')
                except:
                    pass

            x = LEFT_MARGIN
            cols_data = [
                (Inches(0.3), icon, icon_color, True),
                (Inches(2.8), assignee, '#222222', False),
                (Inches(3.8), task[:80] + ('...' if len(task) > 80 else ''), '#444444', False),
                (Inches(1.3), f"{hours:.1f}h" if hours else '', '#555555', False),
                (Inches(1.5), start_d, '#555555', False),
                (Inches(1.5), end_d, '#555555', False),
            ]
            for col_w, text, color, is_icon in cols_data:
                cell = slide.shapes.add_textbox(x, y_cursor, col_w, ROW_HEIGHT)
                tf = cell.text_frame
                tf.word_wrap = False
                p = tf.paragraphs[0]
                run = p.add_run()
                run.text = str(text)
                sz = 10 if is_icon else 7
                set_font(run, size=sz, color=color)
                x += col_w

            y_cursor += ROW_HEIGHT


def create_deliverables_slide(prs, data, primary_color, secondary_color):
    """Deliverables tracking slide with status table."""
    deliverables = data.get('deliverables', [])
    if not deliverables:
        return None

    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Deliverables Tracker"
    set_font(run, size=22, bold=True, color=primary_color)

    total = len(deliverables)
    accepted = sum(1 for d in deliverables if d.get('status') == 'accepted')
    in_progress = sum(1 for d in deliverables if d.get('status') == 'in-progress')
    in_review = sum(1 for d in deliverables if d.get('status') == 'in-review')
    not_started = sum(1 for d in deliverables if d.get('status') == 'not-started')
    rejected = sum(1 for d in deliverables if d.get('status') == 'rejected')

    summary_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.95), Inches(12), Inches(0.35))
    stf = summary_box.text_frame
    sp = stf.paragraphs[0]
    summary_parts = [f"{total} Total"]
    if accepted:
        summary_parts.append(f"{accepted} Accepted")
    if in_review:
        summary_parts.append(f"{in_review} In Review")
    if in_progress:
        summary_parts.append(f"{in_progress} In Progress")
    if not_started:
        summary_parts.append(f"{not_started} Not Started")
    if rejected:
        summary_parts.append(f"{rejected} Rejected")
    srun = sp.add_run()
    srun.text = "  |  ".join(summary_parts)
    set_font(srun, size=10, bold=False, color='#666666')

    cols = 5
    col_widths = [Inches(4.0), Inches(2.0), Inches(1.8), Inches(2.5), Inches(2.5)]
    table_top = Inches(1.4)
    max_rows = min(len(deliverables), 15)
    rows = max_rows + 1

    table_shape = slide.shapes.add_table(rows, cols, Inches(0.3), table_top, sum(col_widths), Inches(0.35 * rows))
    table = table_shape.table
    for i, w in enumerate(col_widths):
        table.columns[i].width = w

    headers = ['Deliverable', 'Owner', 'Status', 'Target Date', 'Delivered Date']
    for i, h in enumerate(headers):
        set_cell_text(table.cell(0, i), h, size=9, bold=True, color='#FFFFFF', bg_color=primary_color, alignment=PP_ALIGN.LEFT)

    status_colors = {
        'accepted': '#22C55E',
        'in-review': '#3B82F6',
        'in-progress': '#F59E0B',
        'not-started': '#9CA3AF',
        'rejected': '#EF4444',
    }

    for row_idx, d in enumerate(deliverables[:max_rows]):
        r = row_idx + 1
        bg = '#FFFFFF' if r % 2 == 1 else '#F8F8FC'
        name = d.get('name', '')
        if len(name) > 50:
            name = name[:47] + '...'
        set_cell_text(table.cell(r, 0), name, size=8, bg_color=bg)
        set_cell_text(table.cell(r, 1), d.get('ownerName', ''), size=8, bg_color=bg)

        status = d.get('status', 'not-started')
        status_label = status.replace('-', ' ').title()
        s_color = status_colors.get(status, '#9CA3AF')
        set_cell_text(table.cell(r, 2), status_label, size=8, bold=True, color=s_color, bg_color=bg)

        set_cell_text(table.cell(r, 3), d.get('targetDate', ''), size=8, bg_color=bg)
        set_cell_text(table.cell(r, 4), d.get('deliveredDate', ''), size=8, bg_color=bg)

    if len(deliverables) > max_rows:
        note_box = slide.shapes.add_textbox(Inches(0.5), Inches(7.0), Inches(12), Inches(0.3))
        ntf = note_box.text_frame
        np = ntf.paragraphs[0]
        nrun = np.add_run()
        nrun.text = f"Showing {max_rows} of {len(deliverables)} deliverables."
        set_font(nrun, size=8, italic=True, color='#999999')

    return slide


def generate_pptx(data, output_path):
    primary_color = data.get('primaryColor', '#810FFB')
    secondary_color = data.get('secondaryColor', '#E60CB3')

    ai_report = data.get('aiReport', '')
    sections = parse_markdown_sections(ai_report) if ai_report else {}

    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT

    create_title_slide(prs, data, primary_color, secondary_color)
    create_progress_summary_slide(prs, data, sections, primary_color, secondary_color)
    create_accomplishments_slide(prs, data, sections, primary_color, secondary_color)
    create_raidd_slides(prs, data, sections, primary_color, secondary_color)
    create_upcoming_slide(prs, data, sections, primary_color, secondary_color)
    create_deliverables_slide(prs, data, primary_color, secondary_color)
    create_timeline_slide(prs, data, primary_color, secondary_color)
    create_project_plan_slides(prs, data, primary_color, secondary_color)

    prs.save(output_path)
    return output_path

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: generate_status_report_pptx.py <output_path>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    input_data = json.load(sys.stdin)
    result = generate_pptx(input_data, output_path)
    print(json.dumps({"success": True, "path": result}))
